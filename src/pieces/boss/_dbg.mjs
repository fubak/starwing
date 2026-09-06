// dev probe: dump ship / camera state after N frames
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 300)); });
await page.addInitScript(() => { window.WebSocket = class { constructor() {} addEventListener() {} removeEventListener() {} send() {} close() {} }; });
await page.goto(`http://localhost:5174/?piece=boss&seed=1&mute&autoplay&fixed`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 60000 });
await page.evaluate(() => { cancelAnimationFrame(window.__engine._raf); });
const n = Number(process.argv[2] || 300);
for (let d = 0; d < n; d += 60) await page.evaluate((k) => window.__engine.stepFrames(k), Math.min(60, n - d));
const info = await page.evaluate(() => {
  const e = window.__engine; const p = e.piece; const d = p.debug; const THREE = e.THREE || null;
  const g = d.ship?.isObject3D ? d.ship : d.ship?.group;
  var out = { cam: e.camera.position.toArray().map((v) => +v.toFixed(1)), camRot: e.camera.rotation.toArray().slice(0, 3).map((v) => +v.toFixed(2)), fov: e.camera.fov };
  if (g) { g.updateWorldMatrix(true, true); const mins = [1e9, 1e9, 1e9], maxs = [-1e9, -1e9, -1e9]; g.traverse((o) => { if (o.isMesh && o.geometry) { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; const cs = [bb.min, bb.max]; for (let i = 0; i < 8; i++) { const v = cs[i & 1].clone(); v.y = cs[(i >> 1) & 1].y; v.z = cs[(i >> 2) & 1].z; v.applyMatrix4(o.matrixWorld); [v.x, v.y, v.z].forEach((c, k) => { mins[k] = Math.min(mins[k], c); maxs[k] = Math.max(maxs[k], c); }); } } }); out.box = { min: mins.map((v) => +v.toFixed(1)), max: maxs.map((v) => +v.toFixed(1)) }; }
  if (g) { out.shipPos = g.position.toArray().map((v) => +v.toFixed(1)); out.shipScale = g.scale.toArray(); out.child = g.children[0]?.scale.toArray(); out.vis = g.visible; let cnt = 0; g.traverse((o) => { if (o.isMesh) cnt++; }); out.meshes = cnt; }
  out.S = { phase: d.S.phase, ft: d.S.ft, cam: d.S.cam?.mode ?? d.S.camMode };
  out.info = e.renderer.info.render;
  let visBalls = 0; e.scene.traverse((o) => { if (o.visible && o.material?.uniforms?.uPuff) visBalls++; }); out.visBalls = visBalls;
  out.sceneChildren = e.scene.children.length;
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
