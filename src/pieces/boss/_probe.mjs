// dev probe (not part of the piece): boot the piece headless, report errors + frame timing
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text().slice(0, 300)); });
page.on('crash', () => console.log('PAGE CRASHED'));
await page.goto('http://localhost:5173/?piece=boss&seed=1&mute&autoplay&fixed', { waitUntil: 'networkidle' });
const ok = await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 60000 }).catch(() => false);
console.log('booted', !!ok);
await page.evaluate(() => { cancelAnimationFrame(window.__engine._raf); window.__engine.stop = () => {}; });
const measure = async (label, setup) => {
  const t0 = Date.now();
  const info = await page.evaluate((setup) => {
    const e = window.__engine; const sc = e.scene;
    const byName = (n) => sc.getObjectByName(n);
    eval(setup);
    const t0 = performance.now();
    for (let k = 0; k < 3; k++) { e.composer.render(); e.renderer.getContext().finish(); }
    return { total: Math.round((performance.now() - t0) / 3), calls: e.renderer.info.render.calls, tris: e.renderer.info.render.triangles };
  }, setup);
  console.log(label, Date.now() - t0, 'ms', JSON.stringify(info));
};
// advance to t=1 first
await page.evaluate(() => { const e = window.__engine; for (let k = 0; k < 60; k++) { e.input.update(1 / 60, e.time += 1 / 60); e.piece.update(1 / 60, e.time); e.input.endFrame(); } });
await measure('baseline', '');
await measure('no bloom', 'e.bloom.enabled=false');
await measure('no sky', 'byName("sky").visible=false');
await measure('no boss', 'byName("GORGON").visible=false');
await measure('boss back, sky back, bloom back; points hidden', 'byName("GORGON").visible=true; byName("sky").visible=true; e.bloom.enabled=true; sc.traverse(o=>{ if(o.isPoints) o.visible=false })');
await measure('shield hidden too', 'byName("GORGON").traverse(o=>{ if(o.material && o.material.uniforms && o.material.uniforms.uDissolve) o.visible=false })');
await measure('all ShaderMaterials hidden', 'sc.traverse(o=>{ if(o.isMesh && o.material.isShaderMaterial) o.visible=false })');
await measure('all MeshStandard hidden (shaders back)', 'sc.traverse(o=>{ if(o.isMesh && o.material.isShaderMaterial) o.visible=true; if(o.isMesh && o.material.isMeshStandardMaterial) o.visible=false })');
await browser.close();
