import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log('console:', m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
const t0 = Date.now();
await page.goto('http://localhost:5173/?piece=lookdev&seed=1&mute&autoplay&fixed', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 60000 });
console.log('booted', Date.now() - t0);
await page.evaluate(() => cancelAnimationFrame(window.__engine._raf));
for (let i = 0; i < 3; i++) {
  const ms = await page.evaluate(() => { const s = performance.now(); window.__engine.stepFrames(5); return performance.now() - s; });
  console.log('5 frames ms', ms);
}
const s = Date.now();
await page.screenshot({ path: 'shots/ship_prof.png', timeout: 120000 });
console.log('screenshot ms', Date.now() - s);
await browser.close();
