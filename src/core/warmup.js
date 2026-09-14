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

// ---------------------------------------------------------------------------
// Shadow-depth program determinism.
//
// The shadow pass draws casters with a SHARED `_depthMaterial` singleton whose
// `map` / `alphaMap` / `alphaTest` / `side` fields are mutated per caster.
// But `WebGLRenderer.setProgram` only recomputes the program cache key when a
// *checked* flag changes (lights, fog, instancing, morphs, clipping, ...) —
// `map`/`alphaTest`/`side` are NOT checked. So a mapped caster's depth variant
// is only ever compiled when a `getProgram` call happens to coincide with that
// state — pure draw-order luck. Observed: the docked Arwing's merged hull
// (FrontSide + map, alphaTest=0) drew into the onfoot spot shadow map 100+
// times before its (mapUv=uv, flipSided) depth variant was keyed and compiled
// ~26 s into the stage — a ~30-40 ms hitch mid-play on real hardware.
//
// Fix: give every castShadow mesh a DEDICATED MeshDepthMaterial (deduped per
// source material via WeakMap). A fresh material instance has an empty
// `materialProperties.programs` map, so `getProgram` MUST compute its key on
// the first warm shadow draw — every needed depth variant compiles here,
// deterministically, for any content. Identical keys still share the one
// compiled WebGLProgram, so nothing is duplicated. The renderer keeps copying
// map/alphaMap/alphaTest/side/displacement state onto custom depth materials
// per draw, so behaviour is identical to the shared singleton.
const _depthVariants = new WeakMap();
function warmDepthMaterialFor(material) {
  let d = _depthVariants.get(material);
  if (!d) {
    d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    _depthVariants.set(material, d);
  }
  return d;
}

/**
 * Assign a dedicated depth material to every castShadow mesh under `root`
 * (deduped per source material). Call on any subtree that is built AFTER the
 * stage warm — e.g. a mid-play pool-miss rebuild — so its depth program is
 * compiled on its first shadow draw instead of waiting for the shared
 * depth material's draw-order luck.
 */
export function assignDepthMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.castShadow || o.customDepthMaterial || !o.material) return;
    o.customDepthMaterial = Array.isArray(o.material)
      ? new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
      : warmDepthMaterialFor(o.material);
  });
}

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

  // Dedicated depth material on every caster -> each depth program is keyed +
  // compiled on the first shadow draw below (see note at _depthVariants above).
  assignDepthMaterials(scene);

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
