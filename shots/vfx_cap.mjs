// Fallback capture: reads the WebGL canvas directly (robust under heavy machine load).
import { chromium } from 'playwright';
import fs from 'node:fs';
const times = (process.argv[2] ?? '1,3,6,10').split(',').map(Number);
const W = Number(process.argv[3] ?? 1280), H = Number(process.argv[4] ?? 720);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { console.log('[' + m.type() + ']', m.text().slice(0, 800)); if (m.type() === 'error') errors.push(m.text()); } });
page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); errors.push(e.message); });
await page.goto('http://localhost:5173/?piece=vfx&seed=1&mute&autoplay&fixed' + (process.env.Q ?? '') + '', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 60000 });
await page.evaluate(() => cancelAnimationFrame(window.__engine._raf));
let stepped = 0;
fs.mkdirSync('shots/vfx', { recursive: true });
for (const t of times) {
  const target = Math.round(t * 60); const n = target - stepped;
  const t0 = Date.now();
  for (let d = 0; d < n; d += 60) await page.evaluate((k) => window.__engine.stepFrames(k), Math.min(60, n - d));
  stepped = target;
  const data = await page.evaluate(() => {
    const e = window.__engine; e.composer.render();
    const c = document.createElement('canvas'); c.width = e.renderer.domElement.width; c.height = e.renderer.domElement.height;
    c.getContext('2d').drawImage(e.renderer.domElement, 0, 0);
    return c.toDataURL('image/png');
  });
  const name = `shots/vfx/c${String(t).padStart(3, '0')}.png`;
  fs.writeFileSync(name, Buffer.from(data.split(',')[1], 'base64'));
  console.log(`wrote ${name} (${Date.now() - t0} ms)`);
}
console.log(errors.length ? 'ERRORS: ' + errors.join('\n') : 'no errors');
await browser.close();
