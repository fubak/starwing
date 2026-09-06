// dev-only: time engine steps headlessly. node src/pieces/cinematics/_bench.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const t0 = Date.now();
await page.goto('http://localhost:5173/?piece=' + (process.argv[2] ?? 'cinematics') + '&seed=1&mute&autoplay&fixed', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 60000 });
console.log('boot ms', Date.now() - t0);
await page.evaluate(() => cancelAnimationFrame(window.__engine._raf));
for (const [label, fn] of [['base', () => {}], ['base2', () => {}], ['no shadow', () => { window.__engine.renderer.shadowMap.enabled = false; }], ['no bloom', () => { window.__engine.bloom.enabled = false; }], ['no planet', () => { window.__stage.planet.visible = false; }], ['no ships', () => { window.__stage.arwings.forEach(a=>a.visible=false); window.__stage.greatFox.visible=false; }], ['no sky', () => { window.__stage.sky.visible = false; window.__stage.stars.visible=false; window.__stage.sun.visible=false; }]]) {
  await page.evaluate(fn);
  const t1 = Date.now();
  await page.evaluate(() => { window.__engine.stepFrames(10); const gl = window.__engine.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); });
  console.log(label, '10 steps ms', Date.now() - t1);
}
let t2 = Date.now();
await page.screenshot({ path: '/tmp/bench.png' });
console.log('shot ms', Date.now() - t2);
for (const [label, fn] of [
  ['no grain', () => { window.__ov.grain.style.display = 'none'; }],
  ['no ui', () => { document.getElementById('ui').style.display = 'none'; }],
]) {
  await page.evaluate(fn);
  t2 = Date.now();
  await page.screenshot({ path: '/tmp/bench2.png' });
  console.log(label, 'ms', Date.now() - t2);
}
await browser.close();
