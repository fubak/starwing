/**
 * Generic incremental ("warm") stage builder.
 *
 * `rail` proved the pattern (see beginRail): build the next stage one unit per
 * frame into a parked invisible Group while the current stage plays, then swap.
 * This module generalises it so ANY piece whose create() is written as a
 * generator (`yield` between coarse build phases) gets the same treatment
 * without hand-writing a step list per stage.
 *
 * What a warm build must never do is touch shared state the LIVE stage is using.
 * Every one of those channels is intercepted:
 *
 *   scene     -> a parked `Group` (visible=false). Objects, lights, fog,
 *                background and environment all land on it; lights inside an
 *                invisible subtree are pruned by projectObject, so the live
 *                stage's light census (== every program cache key) is untouched.
 *                Builders that `scene.add()` internally are swept in after each
 *                unit, exactly like beginRail does.
 *   ui        -> a detached <div>; appended to the real UI root at activate,
 *                which also survives the stage switch's resetShared() sweep.
 *   composer  -> a shadow object with its own `passes` array; passes the piece
 *                adds (the lookdev grade pass) are queued and only inserted at
 *                activate, so the live stage keeps its own post chain.
 *   input     -> prototype-delegating shadow: `input.script = ...` in a create()
 *                would otherwise hijack the *current* stage's autoplay.
 *   renderer  -> real (bakes/PMREM need GL), but exposure / shadowMap.autoUpdate
 *   camera       and camera + bloom settings are snapshotted around every unit:
 *   bloom        live values restored after the unit, warm values re-applied
 *                before the next one, and finally committed at activate.
 *
 * Contract returned matches beginRail's: { step(), done, remaining, stepName,
 * activate(), abort() }.
 */
import * as THREE from 'three';
import { createStageWarm } from '../core/warmup.js';
import { trace } from '../core/trace.js';

/**
 * @param ctx    live piece ctx
 * @param name   stage name (diagnostics)
 * @param makeGen (buildCtx) => Generator that yields once per build phase and
 *                returns the piece object ({ update, dispose, ... })
 * @param opts   { onActivate(piece, ctx), phases?: number (for `remaining`) }
 */
export function beginWarmPiece(ctx, name, makeGen, opts = {}) {
  const { scene, camera, renderer, bloom, ui, composer } = ctx;

  // ---------- parked scene
  const stage = new THREE.Group();
  stage.name = `${name}-warm`;
  stage.visible = false;
  scene.add(stage);
  const preOwned = new Set(scene.children);
  const sweep = () => { for (const o of scene.children.slice()) if (o !== stage && !preOwned.has(o)) { preOwned.add(o); stage.add(o); } };

  // ---------- detached UI
  const warmUi = document.createElement('div');
  warmUi.style.cssText = 'position:absolute;inset:0;pointer-events:none';

  // ---------- shadow composer
  const queued = [];
  let warmComposer = composer;
  // The lookdev grade pass is shared across stages; a parked build reuses it via
  // composer.passes.find() and writes ITS preset into the live uniforms — so it
  // becomes part of the global-state swap below.
  const gradePass = composer?.passes.find((p) => p.isLookGrade) ?? null;
  if (composer) {
    warmComposer = Object.create(composer);
    warmComposer.passes = composer.passes.slice();
    warmComposer.addPass = (p) => { warmComposer.passes.push(p); queued.push(p); };
    warmComposer.insertPass = (p, i) => { warmComposer.passes.splice(i, 0, p); queued.push(p); };
    warmComposer.removePass = (p) => {
      const i = warmComposer.passes.indexOf(p); if (i >= 0) warmComposer.passes.splice(i, 1);
      const j = queued.indexOf(p); if (j >= 0) queued.splice(j, 1);
    };
  }

  // ---------- shadow input (script assignment must not hijack the live stage)
  const warmInput = Object.create(ctx.input);

  // ---------- global render state: swapped in/out around every unit
  const cloneUniforms = (u) => { const o = {}; for (const k in u) { const v = u[k].value; o[k] = v && v.clone ? v.clone() : v; } return o; };
  const writeUniforms = (u, o) => { for (const k in o) if (u[k]) { const v = o[k]; if (u[k].value?.copy && v?.copy) u[k].value.copy(v); else u[k].value = v; } };
  const snap = () => ({
    exposure: renderer.toneMappingExposure,
    shadowAuto: renderer.shadowMap.autoUpdate,
    bloom: bloom ? { s: bloom.strength, r: bloom.radius, t: bloom.threshold } : null,
    fov: camera.fov, near: camera.near, far: camera.far, zoom: camera.zoom,
    pos: camera.position.clone(), quat: camera.quaternion.clone(), up: camera.up.clone(),
    grade: gradePass ? { enabled: gradePass.enabled, u: cloneUniforms(gradePass.uniforms) } : null,
  });
  const apply = (s) => {
    renderer.toneMappingExposure = s.exposure;
    renderer.shadowMap.autoUpdate = s.shadowAuto;
    if (bloom && s.bloom) { bloom.strength = s.bloom.s; bloom.radius = s.bloom.r; bloom.threshold = s.bloom.t; }
    camera.fov = s.fov; camera.near = s.near; camera.far = s.far; camera.zoom = s.zoom;
    camera.position.copy(s.pos); camera.quaternion.copy(s.quat); camera.up.copy(s.up);
    camera.updateProjectionMatrix();
    if (s.grade) { gradePass.enabled = s.grade.enabled; writeUniforms(gradePass.uniforms, s.grade.u); }
  };
  let warmGlobals = snap();   // what the half-built stage wants

  // ---------- parked GPU warm (see parkedGpuWarm below)
  let pgw = null;
  function gpuStep() {
    if (!pgw) pgw = parkedGpuWarm(ctx, stage, warmGlobals);
    return pgw.step();
  }

  const buildCtx = { ...ctx, scene: stage, ui: warmUi, composer: warmComposer, input: warmInput };
  const it = makeGen(buildCtx);
  let piece = null, built = false, done = false, phase = 0;
  const total = opts.phases ?? 0;

  const b = {
    get done() { return done; },
    get remaining() { return Math.max(0, total - phase); },
    get stepName() { return built ? `${name}:gpu${phase}${pgw?.lastType ? ':' + pgw.lastType : ''}` : `${name}:${phase}`; },
    step() {
      if (done) return;
      if (built) {                            // build finished -> compile/draw units
        phase++;
        if (!piece || gpuStep()) { done = true; trace.mark('warm:parked-done', `${name} ${phase}u`); }
        return;
      }
      const live = snap();
      apply(warmGlobals);
      try {
        const r = it.next();
        phase++;
        if (r.done) { piece = r.value ?? null; built = true; }
      } finally {
        warmGlobals = snap();
        apply(live);
        sweep();
      }
    },
    /** Mount the parked build: reveal it, commit globals + passes + UI. */
    activate() {
      if (!piece) return null;
      if (!stage.parent) scene.add(stage);   // resetShared() sweeps stray children at the switch
      stage.visible = true;
      // scene-level state the piece set on the parked group
      if (stage.fog) scene.fog = stage.fog;
      if (stage.background) scene.background = stage.background;
      if (stage.environment) scene.environment = stage.environment;
      if (stage.environmentIntensity != null) scene.environmentIntensity = stage.environmentIntensity;
      apply(warmGlobals);
      if (composer) for (const p of queued) if (!composer.passes.includes(p)) composer.addPass(p);
      if (!warmUi.isConnected) ui.appendChild(warmUi);
      if (warmInput.script) ctx.input.script = warmInput.script;
      opts.onActivate?.(piece, ctx);
      return piece;
    },
    /** Throw the half-built stage away (deep dispose so nothing leaks GPU memory). */
    abort() {
      done = true;
      try { pgw?.abort(); } catch {}
      try { it.return?.(); } catch {}
      // Some pieces park the shared camera in their scene (spacesim hangs its
      // speed-lines off it). Never let the live camera go down with the aborted
      // build: an orphaned camera stops getting its world matrix updated.
      for (let p = camera.parent; p; p = p.parent) if (p === stage) { camera.removeFromParent(); scene.add(camera); break; }
      try { piece?.dispose?.(); } catch {}
      try {
        // Geometry + materials only: textures are the one class of resource that
        // IS shared between stages (the procedural noise/glow caches), and
        // disposing those from a discarded build would break the live stage.
        stage.traverse((o) => {
          o.geometry?.dispose?.();
          const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
          for (const m of mats) m?.dispose?.();
        });
      } catch {}
      stage.parent?.remove(stage);
      warmUi.remove();
      piece = null;
    },
  };
  b.gwarmed = true;   // GPU warm is part of the units — the mount frame needs no warm pass
  return b;
}

/**
 * GPU warm of a PARKED stage subtree, as an incremental step machine — usable
 * by hand-written builders (rail) as well as beginWarmPiece.
 *
 * This is the whole point of warming early: a stage switch used to pay every
 * shader compile + first draw + shadow/depth variant on the frame that mounted
 * the stage (1.0-2.3 s of `ren` under software GL). Compiling here instead
 * needs the program cache keys to match what gameplay will use, so for the
 * duration of each unit we make the scene look exactly like the mounted stage:
 * live children hidden (their lights would change the light census —
 * numPointLights is part of every program key — and their meshes would be
 * drawn), the parked stage revealed, its fog/environment/background and the
 * supplied exposure/bloom/camera globals applied. Everything is put back before
 * we return, so the live stage never sees a changed frame.
 *
 * `stage` may carry `fog` / `background` / `environment` / `environmentIntensity`
 * as plain properties — that is how the parked build's scene-level state is
 * described without touching the live scene.
 */
export function parkedGpuWarm(ctx, stage, globals = null) {
  const { scene, camera, renderer, bloom } = ctx;
  const snap = () => ({
    exposure: renderer.toneMappingExposure,
    shadowAuto: renderer.shadowMap.autoUpdate,
    bloom: bloom ? { s: bloom.strength, r: bloom.radius, t: bloom.threshold } : null,
    fov: camera.fov, near: camera.near, far: camera.far, zoom: camera.zoom,
    pos: camera.position.clone(), quat: camera.quaternion.clone(), up: camera.up.clone(),
  });
  const apply = (s) => {
    renderer.toneMappingExposure = s.exposure;
    renderer.shadowMap.autoUpdate = s.shadowAuto;
    if (bloom && s.bloom) { bloom.strength = s.bloom.s; bloom.radius = s.bloom.r; bloom.threshold = s.bloom.t; }
    camera.fov = s.fov; camera.near = s.near; camera.far = s.far; camera.zoom = s.zoom;
    camera.position.copy(s.pos); camera.quaternion.copy(s.quat); camera.up.copy(s.up);
    camera.updateProjectionMatrix();
  };
  const snapScene = () => ({ fog: scene.fog, background: scene.background, environment: scene.environment, envInt: scene.environmentIntensity });
  const applyScene = (s) => { scene.fog = s.fog; scene.background = s.background; scene.environment = s.environment; scene.environmentIntensity = s.envInt; };
  const stageScene = () => ({
    fog: stage.fog ?? null, background: stage.background ?? null,
    environment: stage.environment ?? null, envInt: stage.environmentIntensity ?? 1,
  });
  let gw = null;
  const hidden = [];
  return {
    get done() { return !!gw && gw.done; },
    /** unit kind of the most recent inner step — trace attribution only */
    get lastType() { return gw?.lastType ?? null; },
    /** Run one unit; returns true when the whole warm is finished. */
    step() {
      if (!gw) gw = createStageWarm(renderer, scene, camera, { root: stage });
      const live = snap(), liveScene = snapScene();
      if (globals) apply(globals);
      applyScene(stageScene());
      for (const o of scene.children) if (o !== stage && o.visible) { hidden.push(o); o.visible = false; }
      stage.visible = true;
      try {
        return gw.step();
      } finally {
        stage.visible = false;               // parked again until the caller mounts it
        for (const o of hidden) o.visible = true;
        hidden.length = 0;
        applyScene(liveScene); apply(live);
      }
    },
    abort() { try { gw?.abort(); } catch {} },
  };
}

/** Drain a generator-style create() synchronously (the non-warm code path). */
export function drain(gen) {
  let r;
  do { r = gen.next(); } while (!r.done);
  return r.value;
}
