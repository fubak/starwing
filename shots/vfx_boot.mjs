import { chromium } from 'playwright';
const piece = process.argv[2] ?? 'vfx';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() !== 'debug' && !m.text().includes('Driver')) console.log('[' + m.type() + ']', m.text().slice(0, 600)); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const t0 = Date.now();
await page.goto(`http://localhost:5173/?piece=${piece}&seed=1&mute&autoplay&fixed`, { waitUntil: 'networkidle' });
console.log('networkidle', Date.now() - t0);
await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 120000 });
console.log('booted', Date.now() - t0);
await page.evaluate(() => cancelAnimationFrame(window.__engine._raf));
page.setDefaultTimeout(300000);
const r = await page.evaluate(() => {
  const e = window.__engine; const gl = e.renderer.getContext(); const px = new Uint8Array(4);
  const sync = () => { e.renderer.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  const r = {};
  let s = performance.now(); e.stepFrames(1); sync(); r.first = (performance.now() - s).toFixed(0);
  for (let j = 0; j < 4; j++) { s = performance.now(); e.stepFrames(10); sync(); r['b' + j] = ((performance.now() - s) / 10).toFixed(0) + 'ms'; }
  r.info = JSON.stringify(e.renderer.info.render); r.programs = e.renderer.info.programs.length;
  return r;
});
console.log(r);
await page.screenshot({ path: `shots/vfx_boot_${piece}.png` });
await browser.close();
