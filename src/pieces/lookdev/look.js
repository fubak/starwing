import * as THREE from 'three';
import { PRESETS, resolvePreset, lerpPreset } from './presets.js';
import { makeSky, makeSkyMaterial, applySkyPreset, getSkyNoiseTexture } from './sky.js';
import { makeGradePass, applyGradePreset } from './grade.js';

/**
 * applyLook(ctx, preset, opts) -> Look
 *
 * Installs the global look on a piece's scene:
 *   - lighting rig: sun (shadow-casting DirectionalLight), hemisphere, cool fill
 *   - renderer exposure, bloom parameters, exponential fog
 *   - PMREM environment map generated from the procedural sky (real reflections)
 *   - colour-grade ShaderPass appended after the engine OutputPass
 *   - sky dome (unless opts.sky === false)
 *
 * Returns a handle: { sun, hemi, fill, sky, grade, preset, setPreset(name|obj,
 * instant?), update(dt, t), flash(amount), dispose() }.
 * Call look.update(dt, t) every frame (cross-fades presets, tracks camera).
 *
 * Idempotent: calling again on the same ctx replaces the previous rig.
 */
export function applyLook(ctx, preset = 'space', opts = {}) {
  const { scene, renderer, composer, bloom, camera } = ctx;
  const { shadowSize = 24, shadowMap = 1024, sky: wantSky = true, defer = false } = opts;

  // Tear down an existing rig on this scene (unless we're building detached for a
  // later install() — the live rig keeps rendering while we prebuild).
  if (!defer) scene.userData.look?.dispose?.();

  const target = resolvePreset(THREE, preset);
  const cur = resolvePreset(THREE, preset);
  const from = resolvePreset(THREE, preset);
  let blend = 1;
  const FADE = opts.fade ?? 0.9;

  // ---- lights
  const adds = []; // deferred mode: scene children we mount on install()
  const addToScene = (...os) => { if (defer) adds.push(...os); else scene.add(...os); };
  let installed = !defer;

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.name = 'look-sun';
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowMap, shadowMap);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 200;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -shadowSize;
  sun.shadow.camera.right = sun.shadow.camera.top = shadowSize;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  addToScene(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
  hemi.name = 'look-hemi';
  const fill = new THREE.DirectionalLight(0xffffff, 0.4);
  fill.name = 'look-fill';
  // planet-bounce / rim: cool light from below-behind so hulls get a second
  // specular edge that separates them from the sky (Star Fox Zero ocean bounce)
  const rim = new THREE.DirectionalLight(0xffffff, 0.6);
  rim.name = 'look-rim';
  addToScene(hemi, fill, fill.target, rim, rim.target);

  // ---- sky
  let sky = null;
  if (wantSky) {
    sky = wantSky instanceof THREE.Mesh ? wantSky : makeSky(cur);
    if (!sky.parent) addToScene(sky);
  }

  // ---- environment (PMREM of the sky at the *target* preset)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMat = makeSkyMaterial();
  const envScene = new THREE.Scene();
  const envMesh = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), envMat);
  envScene.add(envMesh);
  let envRT = null;
  const buildEnv = (p) => {
    applySkyPreset(envMat, p);
    envMat.uniforms.uNoise.value = getSkyNoiseTexture(renderer);
    envMat.uniforms.uStars.value = 0; // stars are noise in reflections
    // A soft, wider sun blob: a hard 2-texel disc turns into a square in the PMREM mips.
    envMat.uniforms.uSunSize.value = 0.11;
    envMat.uniforms.uSunIntensity.value = 0.3;
    envMat.uniforms.uSunGlow.value *= 0.6;
    const rt = pmrem.fromScene(envScene, 0.035);
    envRT?.dispose();
    envRT = rt;
    if (installed) scene.environment = rt.texture;
  };
  // Deferred rigs postpone the PMREM bake to install() — it lands under the
  // transition fade instead of hitching whatever stage is currently playing.
  if (!defer) buildEnv(target);

  // ---- grade pass (append after OutputPass; composer handles renderToScreen).
  // The pass is shared/reused across looks: dispose() only disables it, so a
  // parked look's grade handle stays valid for reapply().
  let grade = composer.passes.find((p) => p.isLookGrade);
  if (!grade) {
    grade = makeGradePass();
    if (!defer) composer.addPass(grade);
  }
  if (!defer) { grade.enabled = true; grade.uniforms.uAspect.value = (ctx.size?.x || 16) / (ctx.size?.y || 9); }

  const fog = new THREE.FogExp2(0x000000, 0);
  const _dir = new THREE.Vector3();

  const push = (p) => {
    renderer.toneMappingExposure = p.exposure;
    scene.environmentIntensity = p.envIntensity;
    if (bloom) { bloom.strength = p.bloom.strength; bloom.radius = p.bloom.radius; bloom.threshold = p.bloom.threshold; }
    sun.color.copy(p.sun.color); sun.intensity = p.sun.intensity;
    _dir.copy(p.sun.dir).normalize();
    sun.position.copy(sun.target.position).addScaledVector(_dir, 60);
    hemi.color.copy(p.hemi.sky); hemi.groundColor.copy(p.hemi.ground); hemi.intensity = p.hemi.intensity;
    fill.color.copy(p.fill.color); fill.intensity = p.fill.intensity;
    fill.position.copy(fill.target.position).addScaledVector(_dir.copy(p.fill.dir).normalize(), 40);
    const r = p.rim ?? p.fill;
    rim.color.copy(r.color); rim.intensity = p.rim ? r.intensity : 0;
    rim.position.copy(rim.target.position).addScaledVector(_dir.copy(r.dir).normalize(), 40);
    if (p.fog.density > 0.00001) { fog.color.copy(p.fog.color); fog.density = p.fog.density; scene.fog = fog; }
    else scene.fog = null;
    if (sky) sky.setPreset(p);
    applyGradePreset(grade, p);
  };
  if (!defer) push(cur);

  let flashAmt = 0;
  const look = {
    sun, hemi, fill, rim, sky, grade, envScene,
    /** Deferred builds only: mount lights/sky, env map, grade pass and globals. Idempotent. */
    install() {
      if (installed) return;
      installed = true;
      scene.userData.look?.dispose?.(); // replace whatever rig is live now
      for (const o of adds) scene.add(o);
      adds.length = 0;
      if (!envRT) buildEnv(target); else scene.environment = envRT.texture;
      if (!composer.passes.includes(grade)) composer.addPass(grade);
      grade.enabled = true;
      push(cur);
      scene.userData.look = look;
    },
    /**
     * Deferred builds only: park the rig's scene objects under `target` (instead
     * of the scene) and run the postponed PMREM env bake. Used by the campaign's
     * parked-stage warm: the lights must sit inside the parked subtree so the
     * warm render's light census — every program cache key — matches what
     * install() will later produce. Returns the baked environment texture;
     * install() stays idempotent and reparents `adds` into the scene.
     */
    mountTo(parent) {
      for (const o of adds) parent.add(o);
      if (!envRT) buildEnv(target);   // `target` here is the PRESET (see above), not a node
      return envRT?.texture ?? null;
    },
    /** Re-assert globals (env/exposure/fog/grade) after the rig was parked by another stage. */
    reapply() {
      if (envRT) scene.environment = envRT.texture;
      if (!composer.passes.includes(grade)) composer.addPass(grade);
      grade.enabled = true;
      push(cur);
      if (!scene.userData.look) scene.userData.look = look;
    },
    get preset() { return cur; },
    get target() { return target; },
    name: typeof preset === 'string' ? preset : preset.name ?? 'custom',
    /** Cross-fade (or snap) to another preset. */
    setPreset(p, instant = false) {
      const next = resolvePreset(THREE, p);
      lerpPreset(THREE, cur, cur, 1, from);
      Object.assign(target, next);
      look.name = typeof p === 'string' ? p : p.name ?? 'custom';
      buildEnv(target);
      blend = instant ? 1 : 0;
      if (instant) { lerpPreset(THREE, from, target, 1, cur); push(cur); }
    },
    /** Kick a white flash (decays automatically). */
    flash(a = 0.5) { flashAmt = Math.max(flashAmt, a); },
    /** Where the shadow frustum + lights are centred (e.g. follow the player). */
    setFocus(v) { sun.target.position.copy(v); fill.target.position.copy(v); rim.target.position.copy(v); push(cur); },
    update(dt, t) {
      if (blend < 1) {
        blend = Math.min(1, blend + dt / FADE);
        const k = blend * blend * (3 - 2 * blend);
        lerpPreset(THREE, from, target, k, cur);
        push(cur);
      }
      flashAmt = Math.max(0, flashAmt - dt * 3.2);
      grade.uniforms.uFlash.value = flashAmt * flashAmt;
      grade.uniforms.uTime.value = t;
      grade.uniforms.uAspect.value = (ctx.size?.x || 16) / (ctx.size?.y || 9);
      sky?.update(t, ctx.engine?.piece?.camera ?? camera);
    },
    dispose() {
      scene.remove(sun, sun.target, hemi, fill, fill.target, rim, rim.target);
      for (const o of adds) scene.remove(o); // never-installed deferred rigs
      if (sky) { scene.remove(sky); sky.disposeSky?.(); }
      envRT?.dispose(); envMat.dispose(); envMesh.geometry.dispose(); pmrem.dispose();
      if (scene.environment) scene.environment = null;
      scene.fog = null;
      // the grade pass is shared between looks — disable, don't destroy, so other
      // looks (or a parked rig being reattached) can reuse the same object
      grade.enabled = false;
      if (scene.userData.look === look) delete scene.userData.look;
    },
  };
  if (!defer) scene.userData.look = look;
  return look;
}

export { PRESETS };
