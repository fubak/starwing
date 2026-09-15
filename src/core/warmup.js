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
      if (o.isInstancedMesh) {
        if (o.count < o.instanceMatrix.count) { counts.push([o, o.count]); o.count = o.instanceMatrix.count; }
        // see warmSteps: instanceColor flips a program-key bit on first setColorAt
        if (!o.instanceColor) o.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(o.instanceMatrix.count * 3).fill(1), 3);
      }
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

/**
 * INCREMENTAL stage warm (pass 3).
 *
 * `compileScene` + `warmRender` above do the whole scene in ONE call each, which
 * is exactly the right *content* but the wrong *schedule*: the transition frame
 * that mounts a stage carried the entire compile + one full forced-visible draw
 * (measured: 1.0-2.1 s of `ren` per stage switch under software GL, i.e. a very
 * visible hitch/black-frame stretch on real hardware too).
 *
 * `createStageWarm()` does the identical work split into small units the
 * campaign can pace one budget's worth per frame while the transition fade is
 * still black:
 *
 *   1. texture uploads, ~24 per unit
 *   2. dedicated depth materials (see _depthVariants note above)
 *   3. compile + draw in chunks of at most `chunk` drawables AND at most
 *      `mats` *newly seen* materials (pass 4). The drawable count alone was the
 *      wrong budget: shader compiles are per material, and the parked stages'
 *      material variety is front-loaded, so a flat 24-drawable chunk compiled
 *      47-63 programs in ONE unit (measured 0.8-1.5 s on software GL) while the
 *      following 15 units compiled nothing. Capping *new materials* per unit is
 *      what actually flattens the compile cost across frames.
 *
 * A unit also only re-renders the shadow map when its chunk revealed a new
 * `castShadow` drawable — a chunk of sprites/points/non-casters cannot produce a
 * new depth program, and the shadow pass is a full-resolution (up to 2048^2)
 * re-render, i.e. the single most expensive thing in a warm unit.
 *
 * The chunking trick: EVERY non-drawable object (groups, lights, cameras) is
 * forced visible for the whole warm and only *drawables* are toggled. That
 * keeps the light census — and therefore every program cache key — byte for
 * byte identical to what gameplay will use, which a "hide half the tree"
 * split would have silently broken (numPointLights is part of the key).
 *
 * Each unit binds the same tiny 32x32 target the full-fat path used so the
 * compiled variants are the composer's linear/NoToneMapping ones.
 *
 * `root` (default: the whole scene) restricts the census to one subtree. That is
 * how a *parked* stage is warmed while another one is still on screen (see
 * src/game/warm.js): the render still goes through `scene` — programs must be
 * keyed against the real scene's fog/env — but only the parked subtree's
 * drawables are toggled, and the caller hides the live stage around each unit.
 */
export function createStageWarm(renderer, scene, camera, { chunk = 24, textures = 24, mats = 6, root = null } = {}) {
  const it = warmSteps(renderer, scene, camera, chunk, textures, root || scene, mats);
  let done = false, last = null;
  return {
    get done() { return done; },
    /** unit kind of the most recent step ('census'|'tex'|'depth'|'compile'|'draw') — trace attribution only */
    get lastType() { return last; },
    /** Run one unit. Returns true when the whole warm is finished. */
    step() {
      if (done) return true;
      const r = it.next();
      if (r.done) done = true; else last = r.value;
      return done;
    },
    /** Give up early: the generator's finally block restores all scene state. */
    abort() { if (!done) { done = true; try { it.return(); } catch {} } },
  };
}

function* warmSteps(renderer, scene, camera, chunk, texChunk, root, matBudget = 6) {
  const t0 = performance.now();
  const drawables = [];
  const others = [];      // groups / lights / bones: forced visible for the whole warm
  const vis = [];         // [object, prevVisible]
  const counts = [];      // [instancedMesh, prevCount]
  const ranges = [];      // [geometry, {start,count}]
  const culls = [];       // [object]
  const texes = [];
  const seenTex = new Set();
  const shadowAuto = renderer.shadowMap.autoUpdate;
  if (!_rt) _rt = new THREE.WebGLRenderTarget(32, 32, { depth: true });
  const prevRT = renderer.getRenderTarget();
  const prevAutoClear = renderer.autoClear;
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    renderer.setRenderTarget(prevRT);
    renderer.autoClear = prevAutoClear;
    renderer.shadowMap.autoUpdate = shadowAuto;
    for (const [o, v] of vis) o.visible = v;
    for (const [m, c] of counts) m.count = c;
    for (const [g, r] of ranges) g.drawRange.start = r.start, g.drawRange.count = r.count;
    for (const o of culls) o.frustumCulled = true;
    renderer.shadowMap.needsUpdate = true;
  };

  try {
    // ---- unit 1: census (cheap traverse; collects textures + drawables)
    root.traverse((o) => {
      const isDraw = o.isMesh || o.isPoints || o.isLine || o.isSprite || o.isSkinnedMesh;
      (isDraw ? drawables : others).push(o);
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) {
        for (const k in m) { const t = m[k]; if (t && t.isTexture && !seenTex.has(t)) { seenTex.add(t); texes.push(t); } }
        const u = m.uniforms;
        if (u) for (const k in u) { const t = u[k]?.value; if (t && t.isTexture && !seenTex.has(t)) { seenTex.add(t); texes.push(t); } }
      }
    });
    // groups/lights visible for the whole warm; drawables start hidden and are
    // revealed one chunk at a time
    for (const o of others) if (!o.visible) { vis.push([o, false]); o.visible = true; }
    for (const o of drawables) {
      if (o.visible) vis.push([o, true]);
      o.visible = false;
      if (o.frustumCulled) { culls.push(o); o.frustumCulled = false; }
      if (o.isInstancedMesh) {
        if (o.count < o.instanceMatrix.count) { counts.push([o, o.count]); o.count = o.instanceMatrix.count; }
        // `instancingColor` is part of the program cache key — and instanceColor
        // is created lazily by the first setColorAt(). A pool whose first TINTED
        // claim lands mid-play (world props claim instances per chunk; the ring
        // gates can stay unclaimed for a minute) would otherwise compile a NEW
        // program on a visible frame. Pre-create the white buffer exactly as
        // setColorAt() sizes/fills it so the warmed variant is the tinted one
        // (white = identity for never-tinted instances).
        if (!o.instanceColor) o.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(o.instanceMatrix.count * 3).fill(1), 3);
      }
      const g = o.geometry;
      if (g && g.drawRange && g.drawRange.count < Infinity) { ranges.push([g, { ...g.drawRange }]); g.setDrawRange(0, Infinity); }
    }
    yield 'census';

    // ---- texture uploads
    for (let i = 0; i < texes.length; i += texChunk) {
      for (let j = i; j < Math.min(i + texChunk, texes.length); j++) { try { renderer.initTexture(texes[j]); } catch {} }
      yield 'tex';
    }

    // ---- deterministic shadow-depth variants
    assignDepthMaterials(root);
    yield 'depth';

    // ---- plan the compile/draw chunks: <= `chunk` drawables and <= `matBudget`
    // NEW materials each, remembering whether the chunk adds a shadow caster.
    const groups = [];
    {
      const seenMat = new Set();
      let s = 0, fresh = 0, caster = false;
      for (let i = 0; i < drawables.length; i++) {
        const o = drawables[i];
        const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of ms) if (m && !seenMat.has(m)) { seenMat.add(m); fresh++; }
        if (o.castShadow) caster = true;
        if (i + 1 - s >= chunk || fresh >= matBudget) { groups.push({ s, e: i + 1, caster }); s = i + 1; fresh = 0; caster = false; }
      }
      if (s < drawables.length) groups.push({ s, e: drawables.length, caster });
    }

    // ---- compile + draw, chunk by chunk
    //
    // NOTE (pass 4): there is deliberately NO `renderer.compile()` here.
    // `WebGLRenderer.compile()` gathers lights with `traverseVisible` but walks
    // materials with plain `scene.traverse()` — it ignores visibility. So a
    // per-chunk compile() call compiled EVERY material of the parked stage on the
    // very first chunk (measured: one frame with prog+63 / prog+47 / prog+48,
    // 0.8-1.5 s on software GL) and the chunking bought nothing. `render()` does
    // respect visibility, and it compiles lazily exactly what it draws, so the
    // chunk loop alone spreads the compiles — one chunk = a few new materials =
    // a few new programs, on its own frame.
    renderer.autoClear = true;
    for (const g of groups) {
      for (let j = g.s; j < g.e; j++) drawables[j].visible = true;
      renderer.setRenderTarget(_rt);
      try {
        // shadow pass only when this chunk actually revealed a caster: no caster
        // => no new depth program, and a 2048^2 re-render is pure waste.
        renderer.shadowMap.autoUpdate = g.caster;
        renderer.shadowMap.needsUpdate = g.caster;
        renderer.render(scene, camera);
      } catch (e) { /* keep warming the rest */ }
      renderer.setRenderTarget(prevRT);
      for (let j = g.s; j < g.e; j++) drawables[j].visible = false;
      yield 'draw';
    }
    restore();
    trace.mark('warm:staged', `${(performance.now() - t0).toFixed(0)}ms ${drawables.length}obj ${texes.length}tex`);
  } finally {
    restore();
  }
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
