// Analyse a trace dump: per-stage median/p95, heap alloc rate (post-warm, excluding
// GC-collected dips), and the top mid-play frames with their marks.
// usage: node shots/analyze_trace.mjs shots/trace_before3c.json
import fs from 'node:fs';
const file = process.argv[2] ?? 'shots/trace.json';
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const f = d.frames;
const stageName = (i) => d.stages[i] ?? '?';
const cpu = f.upd.map((u, i) => u + f.ren[i]);
const marksByFrame = new Map();
for (const m of d.marks) { const a = marksByFrame.get(m.frame) ?? []; a.push(m.name + (m.info != null ? `(${m.info})` : '')); marksByFrame.set(m.frame, a); }
const progByFrame = new Map();
for (const p of d.progLog ?? []) { const a = progByFrame.get(p.frame) ?? []; a.push(p.name); progByFrame.set(p.frame, a); }
const stageStart = {};
for (const m of d.marks) if (m.name.startsWith('stage:')) stageStart[m.name.slice(6)] = m.frame;
const byStage = new Map();
for (let i = 0; i < f.dt.length; i++) { const s = stageName(f.stage[i]); if (!byStage.has(s)) byStage.set(s, []); byStage.get(s).push(i); }

const rollMed = (arr) => { const out = new Array(arr.length); const w = []; for (let i = 0; i < arr.length; i++) { w.push(arr[i]); if (w.length > 31) w.shift(); const s = w.slice().sort((a, b) => a - b); out[i] = s.length & 1 ? s[(s.length - 1) >> 1] : 0.5 * (s[s.length / 2 - 1] + s[s.length / 2]); } return out; };
const cpuMed = rollMed(cpu);

console.log(`file=${file} frames=${f.dt.length}`);
console.log('\n| stage | frames | med cpu | p95 | worst | mid-play hitches(>3x, ignoring stage:* frames) |');
console.log('|---|---|---|---|---|---|---|');
for (const [s, idxs] of byStage) {
  const v = idxs.map((i) => cpu[i]);
  const srt = v.slice().sort((a, b) => a - b);
  const hit = idxs.filter((i) => i > 8 && cpuMed[i] > 0.01 && cpu[i] > 3 * cpuMed[i]);
  const midplay = hit.filter((i) => !(marksByFrame.get(i) ?? []).some((m) => m.startsWith('stage:')));
  console.log(`| ${s} | ${idxs.length} | ${srt[srt.length >> 1].toFixed(1)} | ${srt[Math.floor(srt.length * 0.95)].toFixed(1)} | ${Math.max(...v).toFixed(0)} | ${hit.length} (${midplay.length} mid-play) |`);
}

// heap slope per stage: regress usedJSHeapSize over wall time on frames after the
// stage's first 15 (skips transition spike + warm churn at stage start).
console.log('\n| stage | heap slope MB/s (post-first-15-frames) | +KB/frame med | biggest +KB jumps |');
console.log('|---|---|---|---|');
for (const [s, idxs] of byStage) {
  const sub = idxs.slice(15);
  if (sub.length < 20) { console.log(`| ${s} | n/a | | |`); continue; }
  const t0 = f.t[sub[0]], t1 = f.t[sub[sub.length - 1]];
  const h0 = f.heap[sub[0]], h1 = f.heap[sub[sub.length - 1]];
  const slope = (h1 - h0) / Math.max(1, t1 - t0) * 1000 / 1048576;
  const ups = [];
  for (const i of sub) { const dh = f.heap[i] - f.heap[i - 1]; if (dh > 0) ups.push(dh / 1024); }
  ups.sort((a, b) => a - b);
  console.log(`| ${s} | ${slope.toFixed(2)} | ${(ups[ups.length >> 1] || 0).toFixed(0)} | ${ups.slice(-3).map((x) => x.toFixed(0)).join(', ')} |`);
}

// every frame over 3x median, sorted by cpu, with marks+progs
console.log('\nTOP hitched frames:');
const rows = [];
for (let i = 8; i < f.dt.length; i++) if (cpuMed[i] > 0.01 && cpu[i] > 3 * cpuMed[i]) rows.push(i);
rows.sort((a, b) => cpu[b] - cpu[a]);
for (const i of rows.slice(0, 40)) {
  const marks = (marksByFrame.get(i) ?? []).concat((progByFrame.get(i) ?? []).length ? [`prog+${(progByFrame.get(i) ?? []).length}`] : []);
  console.log(`  f${i} t=${(f.t[i] / 1000).toFixed(1)}s ${stageName(f.stage[i])} cpu=${cpu[i].toFixed(1)}ms med=${cpuMed[i].toFixed(1)} upd=${f.upd[i].toFixed(1)} ren=${f.ren[i].toFixed(1)} dHeap=${((f.heap[i] - f.heap[i - 1]) / 1024).toFixed(0)}KB ${marks.join(' ') || '?'}`);
}
// all marks timeline (compact)
console.log('\nmarks:');
for (const m of d.marks) console.log(`  f${m.frame} ${(m.t / 1000).toFixed(1)}s ${m.name}${m.info != null ? ` ${m.info}` : ''}`);
