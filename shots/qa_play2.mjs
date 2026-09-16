import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const out = 'shots/qa_play2';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type()==='error') errors.push(`console: ${m.text()}`); });
await page.goto('http://localhost:5174/?fixed&autoplay&mute&seed=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece && window.__campaign, null, { timeout: 30000 });
await page.evaluate(() => {
  const e = window.__engine;
  cancelAnimationFrame(e._raf);
  e.__realRender = e.composer.render.bind(e.composer);
  e.composer.render = () => {};   // stub: logic-only stepping
  window.__shot = () => e.__realRender(1/60);
});

const seen = {}, log = [];
let lastStage = '', totalFrames = 0, lastShot = -9999;
let backToTitle = false, completeSeen = false;
const MAXF = 60 * 60 * 12;

while (totalFrames < MAXF) {
  const r = await page.evaluate(() => {
    window.__engine.stepFrames(300); // 5 game-seconds logic-only
    const c = window.__campaign;
    return { s: c?.stage, t: c?.stageT, f: c?.failed };
  });
  totalFrames += 300;
  if (!r.s) continue;
  const rec = (seen[r.s] = seen[r.s] || { count: 0, firstT: totalFrames / 60, shots: 0 });
  if (r.s !== lastStage || totalFrames - lastShot >= 1800) {
    if (r.s !== lastStage) { rec.count++; log.push(`stage -> ${r.s} at ${(totalFrames/60).toFixed(1)}s`); lastStage = r.s; }
    rec.shots++;
    lastShot = totalFrames;
    await page.evaluate(() => window.__shot());
    await page.screenshot({ path: path.join(out, `${String(rec.shots).padStart(2,'0')}-${r.s}-${Math.round(totalFrames/60)}s.png`), timeout: 30000 });
    if (r.s === 'complete') completeSeen = true;
    if (r.s === 'title' && completeSeen) { backToTitle = true; break; }
  }
  if (r.f && !log._f) { log.push(`!! FAILED in ${r.s} at stageT=${r.t?.toFixed(1)}`); log._f = 1; }
  if (!r.f) log._f = 0;
}
const stats = await page.evaluate(() => window.__campaign?.stats);
fs.writeFileSync(`${out}/report.json`, JSON.stringify({ backToTitle, completeSeen, totalSecs: totalFrames/60, stats, seen, log, errors }, null, 2));
console.log(JSON.stringify({ backToTitle, completeSeen, totalSecs: totalFrames/60, stats, seen, log, errors }, null, 2));
await browser.close();
