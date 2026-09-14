#!/usr/bin/env node
/**
 * STUTTER TRACE — play the whole campaign in REAL TIME (no `&fixed`) against the
 * HMR-free server, record a per-frame trace, and report every hitch.
 *
 *   node tools/trace.mjs [--seg 22] [--w 960] [--h 540] [--out shots/trace.json]
 *                        [--scale 1] [--stages title,intro,rail,...]
 *
 * A "hitch" is a frame whose wall-clock dt exceeds 3x the rolling median of the
 * previous 31 frames. For each hitch we print the stage, timestamp, dt/median
 * ratio, the update-vs-render split, the program-count delta (shader compile),
 * the draw-call delta and the JS-heap delta, plus any `trace.mark()` names that
 * landed on that frame.
 *
 * This box runs SwiftShader, so absolute ms is meaningless — the *ratio* to the
 * rolling median is what identifies a stutter, and that is hardware-independent
 * for CPU-side causes (compile, GC, construction, texture upload).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(`--${k}`);
const SEG = Number(opt('seg', '22'));       // max wall-clock seconds per stage
const W = Number(opt('w', '960')), H = Number(opt('h', '540'));
const outFile = opt('out', 'shots/trace.json');
const scale = opt('scale', '1');
const STAGES = opt('stages', 'title,intro,rail,boss,space,onfoot,complete').split(',');
const HITCH = Number(opt('hitch', '3'));

async function pickBase() {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  try { const r = await fetch('http://localhost:5174/'); if (r.ok) return 'http://localhost:5174'; } catch {}
  return 'http://localhost:5173';
}
const base = await pickBase();

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const url = `${base}/?trace&mute&autoplay&seed=1${opt('stage', '') ? `&stage=${opt('stage')}` : ''}`;
console.log(`> ${url}  (${W}x${H}, seg=${SEG}s/stage)`);
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__engine?.piece && window.__campaign, null, { timeout: 120000 })
  .catch(() => errors.push('engine never booted'));
if (scale !== 'auto') await page.evaluate((s) => window.__engine.pinScale(Number(s)), scale);
await page.mouse.click(W / 2, H / 2);

// Walk the campaign. Each stage gets up to SEG wall-clock seconds; if it has not
// ended by itself we ask the campaign to advance (same code path as a natural
// completion, so the transition cost is real).
const seen = [];
for (const want of STAGES) {
  // wait until the campaign is actually on this stage
  const okStage = await page.waitForFunction((s) => window.__campaign?.stage === s && !window.__campaign.busy, want, { timeout: 90000 }).then(() => true).catch(() => false);
  if (!okStage) { console.log(`  !! never reached stage ${want}`); continue; }
  seen.push(want);
  const t0 = Date.now();
  console.log(`  stage ${want} ...`);
  while (Date.now() - t0 < SEG * 1000) {
    const st = await page.evaluate(() => ({ stage: window.__campaign?.stage, busy: window.__campaign?.busy }));
    if (st.stage !== want) break;         // ended naturally
    await page.waitForTimeout(500);
  }
  const still = await page.evaluate(() => window.__campaign?.stage);
  if (still === want && want !== STAGES[STAGES.length - 1]) {
    await page.evaluate(() => window.__campaign.skip());
    await page.waitForTimeout(1500);
  }
}

const dump = await page.evaluate(() => window.__trace.dump());
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(dump));
await page.close();
await browser.close();

// ---------------------------------------------------------------- report
const f = dump.frames;
const stageName = (i) => dump.stages[i] ?? '?';
const marksByFrame = new Map();
for (const m of dump.marks) { const a = marksByFrame.get(m.frame) ?? []; a.push(m.name + (m.info != null ? `(${m.info})` : '')); marksByFrame.set(m.frame, a); }

const pct = (arr, p) => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const med = (arr) => pct(arr, 0.5);

// CPU cost of the frame = piece update + composer.render, i.e. everything the
// game itself does on the main thread. This is the hardware-independent signal:
// on SwiftShader the *raster* cost lands in the gap after render() returns, so a
// dt spike can just be the software rasteriser, while a `cpu` spike is a real
// hitch (shader compile, texture upload, construction, GC) on any GPU.
const cpu = f.upd.map((u, i) => u + f.ren[i]);
// rolling median (window 31) computed here so we can do it for any series
const rollMed = (arr) => {
  const out = new Array(arr.length);
  const w = [];
  for (let i = 0; i < arr.length; i++) {
    w.push(arr[i]); if (w.length > 31) w.shift();
    const s = w.slice().sort((a, b) => a - b);
    out[i] = s.length & 1 ? s[(s.length - 1) >> 1] : 0.5 * (s[s.length / 2 - 1] + s[s.length / 2]);
  }
  return out;
};
const cpuMed = rollMed(cpu);
const dtMed = rollMed(f.dt);

// group frames by stage segment (a stage can appear once here)
const byStage = new Map();
for (let i = 0; i < f.dt.length; i++) {
  const s = stageName(f.stage[i]);
  if (!byStage.has(s)) byStage.set(s, []);
  byStage.get(s).push(i);
}

const progByFrame = new Map();
for (const p of (dump.progLog ?? [])) { const a = progByFrame.get(p.frame) ?? []; a.push(p.name); progByFrame.set(p.frame, a); }

const hitches = [];
for (let i = 5; i < f.dt.length; i++) {
  const m = cpuMed[i];
  if (m <= 0.01) continue;
  if (cpu[i] > HITCH * m) {
    const progs = progByFrame.get(i) ?? [];
    hitches.push({
      frame: i, stage: stageName(f.stage[i]), t: +(f.t[i] / 1000).toFixed(2),
      cpu: +cpu[i].toFixed(1), med: +m.toFixed(1), x: +(cpu[i] / m).toFixed(1),
      dt: +f.dt[i].toFixed(0),
      upd: +f.upd[i].toFixed(1), ren: +f.ren[i].toFixed(1),
      dProg: f.prog[i] - f.prog[i - 1], dCalls: f.calls[i] - f.calls[i - 1],
      dHeapKB: Math.round((f.heap[i] - f.heap[i - 1]) / 1024),
      marks: (marksByFrame.get(i) ?? []).concat(progs.length ? [`prog+${progs.length}:${[...new Set(progs)].slice(0, 3).join(',')}`] : []),
    });
  }
}

const table = (label, series, medSeries) => {
  console.log(`\n### ${label}`);
  console.log('| stage | frames | median ms | p95 | p99 | worst | hitches | prog start->end | calls med |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const [s, idxs] of byStage) {
    const v = idxs.map((i) => series[i]);
    const hn = idxs.filter((i) => i > 5 && medSeries[i] > 0.01 && series[i] > HITCH * medSeries[i]).length;
    console.log(`| ${s} | ${idxs.length} | ${med(v).toFixed(1)} | ${pct(v, 0.95).toFixed(1)} | ${pct(v, 0.99).toFixed(1)} | ${Math.max(...v).toFixed(0)} | ${hn} | ${f.prog[idxs[0]]} -> ${f.prog[idxs[idxs.length - 1]]} | ${med(idxs.map((i) => f.calls[i])).toFixed(0)} |`);
  }
};
table('CPU frame cost (update + render) — the hardware-independent stutter signal', cpu, cpuMed);
table('wall-clock dt (includes SwiftShader raster; absolute values meaningless here)', f.dt, dtMed);

console.log(`\nHITCHES (cpu > ${HITCH}x rolling median cpu): ${hitches.length}`);
console.log('| t s | stage | cpu ms | med | x | dt | upd | ren | dProg | dCalls | dHeap KB | what |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const h of hitches) console.log(`| ${h.t} | ${h.stage} | ${h.cpu} | ${h.med} | ${h.x}x | ${h.dt} | ${h.upd} | ${h.ren} | ${h.dProg} | ${h.dCalls} | ${h.dHeapKB} | ${h.marks.join(' ') || '?'} |`);

// program growth per stage: programs compiled AFTER the stage's first 10 frames
// are compiles landing on gameplay frames — the thing we must drive to zero.
console.log('\n### shader programs compiled during each stage (frame >= stage start + 10)');
console.log('| stage | total compiled in stage | LATE (after first 10 frames) | names |');
console.log('|---|---|---|---|');
for (const [s, idxs] of byStage) {
  const lo = idxs[0], hi = idxs[idxs.length - 1];
  const inStage = (dump.progLog ?? []).filter((p) => p.frame >= lo && p.frame <= hi);
  const late = inStage.filter((p) => p.frame >= lo + 10);
  const names = [...new Set(late.map((p) => p.name))].slice(0, 6).join(', ');
  console.log(`| ${s} | ${inStage.length} | ${late.length} | ${names} |`);
}
console.log(`\ntotal programs at end: ${f.prog[f.prog.length - 1]}`);
// heap slope: GC sawtooth detection
const heapUp = [];
for (let i = 1; i < f.heap.length; i++) { const d = f.heap[i] - f.heap[i - 1]; if (d > 0) heapUp.push(d); }
console.log(`per-frame heap growth: median ${(med(heapUp) / 1024).toFixed(0)} KB/frame, p95 ${(pct(heapUp, 0.95) / 1024).toFixed(0)} KB`);
const scaleChanges = f.scale.filter((v, i) => i > 0 && v !== f.scale[i - 1]).length;
console.log(`renderScale changes: ${scaleChanges}`);
console.log(errors.length ? `\nERRORS (${errors.length}):\n${errors.slice(0, 20).join('\n')}` : '\nno page errors');
console.log(`\nwrote ${outFile} (${f.dt.length} frames, ${dump.marks.length} marks)`);
