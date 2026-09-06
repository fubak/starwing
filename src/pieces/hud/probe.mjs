// dev: patient probe (long screenshot timeout, timing) — node src/pieces/hud/probe.mjs 1,3
import { chromium } from 'playwright';
const times = (process.argv[2] || '1,3,6,10').split(',').map(Number);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
let t0 = Date.now();
await page.goto('http://localhost:5174/?piece=hud&fixed&mute&seed=1&autoplay', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 60000 });
console.log('boot', Date.now() - t0, 'ms');
await page.evaluate(() => cancelAnimationFrame(window.__engine._raf));
let stepped = 0;
for (const t of times) {
  const target = Math.round(t * 60);
  t0 = Date.now();
  while (stepped < target) { const k = Math.min(30, target - stepped); await page.evaluate((k) => window.__engine.stepFrames(k), k); stepped += k; }
  console.log(`stepped to ${t}s in`, Date.now() - t0, 'ms');
  t0 = Date.now();
  await page.screenshot({ path: `shots/hud/t${String(t).padStart(3, '0')}.png`, timeout: 180000 });
  console.log('shot', Date.now() - t0, 'ms');
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
