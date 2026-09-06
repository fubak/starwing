// dev probe: split per-frame cost into update / render / gl.finish
import { chromium } from 'playwright';
const scale = Number(process.argv[2] || 0.4);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Math.round(1280 * scale), height: Math.round(720 * scale) } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://localhost:5173/?piece=boss&seed=1&mute&autoplay&fixed`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 60000 });
await page.evaluate(() => { cancelAnimationFrame(window.__engine._raf); });
const run = async (label, setup) => {
  const r = await page.evaluate((setup) => {
    const e = window.__engine; const gl = e.renderer.getContext(); const sc = e.scene;
    eval(setup);
    let up = 0, rend = 0, fin = 0; const N = 6;
    for (let i = 0; i < N; i++) {
      const dt = 1 / 60; let t0 = performance.now();
      e.input.update(dt, e.time += dt); e.piece.update(dt, e.time); up += performance.now() - t0;
      t0 = performance.now(); e.composer.render(dt); rend += performance.now() - t0;
      t0 = performance.now(); gl.finish(); const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); fin += performance.now() - t0;
      e.input.endFrame();
    }
    const info = e.renderer.info; return { up: (up / N) | 0, render: (rend / N) | 0, finish: (fin / N) | 0, calls: info.render.calls, tris: info.render.triangles, progs: info.programs.length };
  }, setup);
  console.log(label.padEnd(28), JSON.stringify(r));
};
await run('warmup', '');
await run('baseline', '');
await run('no bloom', 'e.bloom.enabled=false');
await run('bloom, no sky', 'e.bloom.enabled=true; sc.getObjectByName("sky").visible=false');
await run('sky, no boss', 'sc.getObjectByName("sky").visible=true; sc.getObjectByName("GORGON").visible=false');
await run('boss, no shield', 'sc.getObjectByName("GORGON").visible=true; sc.getObjectByName("GORGON").traverse(o=>{ if(o.material?.uniforms?.uDissolve) o.visible=false })');
await run('no arwing', 'sc.getObjectByName("GORGON").traverse(o=>{ if(o.material?.uniforms?.uDissolve) o.visible=true }); (sc.getObjectByName("arwing")||{}).visible=false');
await run('no pointlights', '(sc.getObjectByName("arwing")||{}).visible=true; sc.traverse(o=>{ if(o.isPointLight) o.visible=false })');
await run('nothing but sky', 'sc.traverse(o=>{ if(o.isMesh||o.isPoints) o.visible=false }); sc.getObjectByName("sky").traverse(o=>o.visible=true)');
await run('empty scene', 'sc.traverse(o=>{ if(o.isMesh||o.isPoints) o.visible=false })');
await browser.close();
