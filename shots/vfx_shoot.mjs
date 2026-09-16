// Patient clone of tools/shoot.mjs frame capture (no per-evaluate timeout) for iteration under heavy load.
import { chromium } from 'playwright';
import fs from 'node:fs';
const times = (process.argv[2] ?? '1,3,6,10').split(',').map(Number);
const out = 'shots/vfx_iter'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { if (!m.text().includes('Driver')) errors.push(m.type() + ': ' + m.text().slice(0, 500)); } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('http://localhost:5173/?piece=vfx&seed=1&mute&autoplay&fixed', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 120000 });
await page.evaluate(() => cancelAnimationFrame(window.__engine._raf));
page.setDefaultTimeout(600000);
let stepped = 0;
for (const t of times) {
  const target = Math.round(t * 60);
  while (stepped < target) { const k = Math.min(20, target - stepped); await page.evaluate((k) => window.__engine.stepFrames(k), k); stepped += k; }
  await page.screenshot({ path: `${out}/t${String(t).padStart(3, '0')}.png` });
  console.log('t=' + t);
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
