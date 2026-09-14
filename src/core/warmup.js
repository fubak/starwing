/**
 * One-shot GPU warmup for a freshly-mounted stage: the goal is that NOTHING
 * pays first-use cost on a visible gameplay frame — no shader compile, no
 * texture upload, no shadow-map first-draw, no pipeline creation.
 *
 * `renderer.compile()` alone is not enough: it builds program objects for every
 * material in the scene, but it does NOT
 *   - draw anything (drivers build the real pipeline state on first draw),
 *   - compile the depth/distance variants used by the shadow pass,
 *   - upload textures whose objects are culled or hidden (pools, effects).
 *
 * `warmStage(renderer, scene, camera)` therefore renders the whole scene ONCE,
 * offscreen into a 32x32 target, with every renderable forced visible, every
 * pool's draw count expanded to capacity and every drawRange opened up. That is
 * a real draw of every program under the real light state — compiles, links,
 * pipeline creation, texture uploads and the shadow pass all land in that one
 * call, which runs while the transition fade is still black.
 */
import * as THREE from 'three';
import { trace } from './trace.js';

let _rt = null;

/** Upload every texture reachable from any material under `root` now. */
export function uploadTextures(renderer, root) {
  const seen = new Set();
  root.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      for (const k in m) {
        const t = m[k];
        if (t && t.isTexture && !seen.has(t)) { seen.add(t); try { renderer.initTexture(t); } catch {} }
      }
      const u = m.uniforms;
      if (u) for (const k in u) { const t = u[k]?.value; if (t && t.isTexture && !seen.has(t)) { seen.add(t); try { renderer.initTexture(t); } catch {} } }
    }
  });
  return seen.size;
}

/**
 * Render `scene` once into a tiny render target with everything drawn.
 * Restores all visibility/count/drawRange state afterwards.
 */
export function warmRender(renderer, scene, camera) {
  const t0 = performance.now();
  // state we must restore
  const visChanged = [];   // [object, prev]
  const counts = [];       // [instancedMesh, prevCount]
  const ranges = [];       // [geometry, {start,count}]
  const culls = [];        // [object, prev]
  const shadowPrev = renderer.shadowMap.needsUpdate;

  scene.traverse((o) => {
    // Force EVERY object visible — including Groups: an invisible ancestor prunes
    // its whole subtree before drawables are reached, so hidden pools/sets (the
    // hangar, parked enemy craft, effect groups) never warmed and their first
    // reveal used to pay a compile storm mid-play.
    if (!o.visible) { visChanged.push([o, o.visible]); o.visible = true; }
    if (o.isMesh || o.isPoints || o.isLine || o.isSprite || o.isSkinnedMesh) {
      if (o.frustumCulled) { culls.push(o); o.frustumCulled = false; }
      const g = o.geometry;
      if (o.isInstancedMesh && o.count < o.instanceMatrix.count) { counts.push([o, o.count]); o.count = o.instanceMatrix.count; }
      if (g && g.drawRange && g.drawRange.count < Infinity) { ranges.push([g, { ...g.drawRange }]); g.setDrawRange(0, Infinity); }
    }
  });

  renderer.shadowMap.needsUpdate = true;
  if (!_rt) _rt = new THREE.WebGLRenderTarget(32, 32, { depth: true });
  // Render into a tiny target — matching what the composer does every frame —
  // so the compiled variants are the srgb-linear/NoToneMapping programs the
  // RenderPass actually draws with (a null-target render would compile the
  // wrong, screen-space variants and first draws would still compile mid-play).
  const prevRT = renderer.getRenderTarget();
  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = true;
  try {
    renderer.setRenderTarget(_rt);
    renderer.render(scene, camera);
  } finally {
    renderer.setRenderTarget(prevRT);
    renderer.autoClear = prevAutoClear;
    for (const [o, v] of visChanged) o.visible = v;
    for (const [m, c] of counts) m.count = c;
    for (const [g, r] of ranges) g.drawRange.start = r.start, g.drawRange.count = r.count;
    for (const o of culls) o.frustumCulled = true;
    renderer.shadowMap.needsUpdate = true; // the warm render's shadow pass is stale anyway
  }
  const ms = performance.now() - t0;
  trace.mark('warm:render', ms.toFixed(0));
  return ms;
}

/** Force-compile (async, parallel where KHR_parallel_shader_compile exists). */
export async function compileScene(renderer, scene, camera, capMs = 2500) {
  trace.mark('warm:compile');
  const t0 = performance.now();
  // compile() walks traverseVisible and builds variants for the CURRENT render
  // target — with no target bound it would compile srgb/ACES screen variants
  // the EffectComposer never uses (its RenderPass draws RT-bound). Bind the
  // tiny RT so the compiled programs are the linear/NoToneMapping variants
  // gameplay actually draws, and force-show every subtree so hidden pools and
  // parked sets get programs too.
  const visChanged = [];
  scene.traverse((o) => { if (!o.visible) { visChanged.push([o, o.visible]); o.visible = true; } });
  if (!_rt) _rt = new THREE.WebGLRenderTarget(32, 32, { depth: true });
  const prevRT = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(_rt);
    if (renderer.compileAsync) await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, capMs))]);
    else renderer.compile(scene, camera);
  } catch {} finally {
    renderer.setRenderTarget(prevRT);
    for (const [o, v] of visChanged) o.visible = v;
  }
  const ms = performance.now() - t0;
  trace.mark('warm:compile-done', ms.toFixed(0));
  return ms;
}
