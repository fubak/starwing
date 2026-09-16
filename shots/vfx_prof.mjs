import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() !== 'debug') console.log('[' + m.type() + ']', m.text().slice(0, 800)); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:5173/?quick&piece=${process.argv[2]??"vfx"}&seed=1&mute&autoplay&fixed', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 60000 });
await page.evaluate(() => cancelAnimationFrame(window.__engine._raf));
page.setDefaultTimeout(200000);
const info = await page.evaluate(() => {
  if (location.search.includes("quick")) { const e = window.__engine; const gl = e.renderer.getContext(); const px = new Uint8Array(4); const sync = () => { e.renderer.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }; const r={}; for (let j=0;j<6;j++){ sync(); const s=performance.now(); e.stepFrames(10); sync(); r["b"+j]=((performance.now()-s)/10).toFixed(0)+"ms"; } return r; }
  const e = window.__engine; const gl = e.renderer.getContext(); const px = new Uint8Array(4);
  const sync = () => { e.renderer.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  const timeIt = (n) => { sync(); const s = performance.now(); e.stepFrames(n); sync(); return ((performance.now() - s) / n).toFixed(0) + 'ms'; };
  const out = { warm: timeIt(5), all: timeIt(5) };
  for (const k of [...e.scene.children]) { k.visible = false; out['without ' + (k.name || k.type) + '#' + k.id] = timeIt(4); k.visible = true; }
  const vfxg = e.scene.children.find((k) => k.name === 'vfx');
  if (vfxg) for (const k of vfxg.children) { k.visible = false; out['without vfx/' + k.type + '#' + k.id] = timeIt(4); k.visible = true; }
  out.info = JSON.stringify(e.renderer.info.render);
  return out;
});
console.log(info);
await browser.close();
