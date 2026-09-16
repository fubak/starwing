// QA pass-2: full campaign playthrough, fixed-step + autoplay scripts.
// Low render scale so SwiftShader stepping is fast; judges flow, not beauty.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.BASE_URL || 'http://localhost:5174';
const out = 'shots/qa_play';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(`${base}/?fixed&autoplay&mute&seed=1`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece && window.__campaign, null, { timeout: 30000 });
await page.evaluate(() => { cancelAnimationFrame(window.__engine._raf); window.__engine.pinScale(0.3); });

const seen = {};
const log = [];
let lastStage = '';
let totalFrames = 0;
const MAXF = 60 * 60 * 15; // 15 min game-time cap
let backToTitle = false, completeSeen = false;
let lastShot = -999;

while (totalFrames < MAXF) {
  await page.evaluate(() => window.__engine.stepFrames(120));
  totalFrames += 120;
  const st = await page.evaluate(() => ({
    s: window.__campaign?.stage, t: window.__campaign?.stageT,
    f: window.__campaign?.failed, p: window.__campaign?.paused,
    c: window.__engine.renderer.info.render.calls,
    tr: window.__engine.renderer.info.render.triangles,
  }));
  if (!st.s) continue;
  const rec = (seen[st.s] = seen[st.s] || { count: 0, maxCalls: 0, maxTris: 0, firstFrame: totalFrames, shots: 0 });
  rec.maxCalls = Math.max(rec.maxCalls, st.c);
  rec.maxTris = Math.max(rec.maxTris, st.tr);
  if (st.s !== lastStage) {
    lastStage = st.s;
    rec.count++;
    rec.shots++;
    await page.screenshot({ path: path.join(out, `${String(rec.shots).padStart(2, '0')}-${st.s}-enter.png`), timeout: 60000 });
    log.push(`stage -> ${st.s} at ${(totalFrames / 60).toFixed(1)}s game-time`);
    if (st.s === 'complete') completeSeen = true;
    if (st.s === 'title' && completeSeen) { backToTitle = true; break; }
    lastShot = totalFrames;
  } else if (totalFrames - lastShot >= 900) {
    rec.shots++;
    await page.screenshot({ path: path.join(out, `${String(rec.shots).padStart(2, '0')}-${st.s}-t${Math.round(totalFrames / 60)}.png`), timeout: 60000 });
    lastShot = totalFrames;
  }
  if (st.f && !log._failed) { log.push(`!! FAILED during ${st.s} at stageT=${st.t?.toFixed(1)}`); log._failed = true; }
  if (!st.f) log._failed = false;
}

const stats = await page.evaluate(() => window.__campaign?.stats);
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ backToTitle, completeSeen, totalSecs: totalFrames / 60, stats, seen, log, errors }, null, 2));
console.log(JSON.stringify({ backToTitle, completeSeen, totalSecs: totalFrames / 60, stats, seen, log, errors }, null, 2));
await browser.close();
