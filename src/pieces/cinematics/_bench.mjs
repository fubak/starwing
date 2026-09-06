// dev-only: time engine steps + screenshots headlessly. node src/pieces/cinematics/_bench.mjs [piece] [frames...]
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() !== 'debug') console.log('[console]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const t0 = Date.now();
await page.goto('http://localhost:5173/?piece=' + (process.argv[2] ?? 'cinematics') + '&seed=1&mute&autoplay&fixed' + (process.env.CIN ? '&cin=' + process.env.CIN : ''), { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 60000 });
console.log('boot ms', Date.now() - t0);
await page.evaluate(() => cancelAnimationFrame(window.__engine._raf));
const frames = process.argv.slice(3).map(Number);
let at = 0;
for (const f of frames.length ? frames : [60, 180]) {
  const t1 = Date.now();
  while (at < f) { const k = Math.min(30, f - at); await page.evaluate((k) => window.__engine.stepFrames(k), k); at += k; }
  console.log(`step->${f} ms`, Date.now() - t1);
  const t2 = Date.now();
  await page.screenshot({ path: `/tmp/bench_${process.env.CIN ?? 'title'}_${f}.png`, timeout: 120000 });
  console.log(`shot@${f} ms`, Date.now() - t2);
}
await browser.close();
