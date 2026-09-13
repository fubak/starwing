// PIECE: cinematics — title screen, intro (Great Fox fly-by + hangar launch),
// level-start letterboxed pan, mission-complete fly-away with score tally.
//
// Exports: create(ctx) (showcase autoplays title -> intro -> complete), and
// playTitle(ctx), playIntro(ctx), playComplete(ctx, stats) which return promises.
//
// Look: uses lookdev's applyLook (lights / env / grade / sky) and makePlanet so
// the cinematics match the rest of the game, and the ship piece's Arwing.
import * as THREE from 'three';
import { Ease, seg, evalTrack, evalScalar, clamp01, lerp, smoothstep } from './tween.js';
import { makeMaterials, buildHangar, makeArwing } from './assets.js';
import { buildGreatFox } from './greatfox.js';
import { Overlay } from './overlay.js';
import { applyLook, makePlanet, resolvePreset, PRESETS } from '../lookdev/index.js';

export { buildHangar } from './assets.js';
export { buildGreatFox, makeGreatFoxMaterials, patchRim, loft } from './greatfox.js';

// Headless harness runs (?fixed / ?autoplay) must not be yanked by Vite full
// reloads triggered by other pieces being edited mid-shoot.
if (import.meta.hot && /[?&](fixed|autoplay)\b/.test(location.search)) {
  import.meta.hot.on('vite:beforeFullReload', () => new Promise(() => {}));
}

/* Cinematic look preset: deep-space dawn, a bit darker + more nebula than lookdev's 'space'. */
const CINE_PRESET = {
  ...PRESETS.space,
  name: 'cinematic',
  exposure: 1.0,
  envIntensity: 0.7,
  bloom: { strength: 0.6, radius: 0.55, threshold: 0.86 },
  sun: { dir: [0.6, 0.38, 0.7], color: 0xfff1d6, intensity: 2.9, size: 0.022, glow: 0.45 },
  hemi: { sky: 0x3d63b8, ground: 0x1a1230, intensity: 0.8 },
  fill: { dir: [-0.7, 0.35, 0.6], color: 0x3f7fff, intensity: 1.1 },
  sky: { zenith: 0x02040e, horizon: 0x12204a, ground: 0x030308, haze: 5.5, stars: 1.0, nebula: 1.0, nebulaA: 0x1e2e8a, nebulaB: 0xb0326e, milky: 0.6 },
  grade: { contrast: 1.08, saturation: 1.14, lift: 0x030410, gain: 0xfff8f0, gamma: 1.0, vignette: 0.42, grain: 0.03 },
};
const SUN_DIR = new THREE.Vector3(...CINE_PRESET.sun.dir).normalize();
const PLANET_DIR = new THREE.Vector3(-0.22, -0.30, -0.93).normalize();
const PLANET_POS = PLANET_DIR.clone().multiplyScalar(1500);
const PLANET_R = 430;

/* ------------------------------------------------------------------ */
/* Stage: shared scene setup for all cinematics                        */
/* ------------------------------------------------------------------ */
class Stage {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng, camera } = ctx;
    this.scene = scene; this.camera = camera;
    this._cam0 = { near: camera.near, far: camera.far, fov: camera.fov };
    camera.near = 0.1; camera.far = 6000; camera.updateProjectionMatrix();
    this.own = []; // everything this stage adds to the scene (and nothing else) is removed in dispose()

    // global look (lights, env, grade, sky)
    this.look = applyLook(ctx, CINE_PRESET, { shadowSize: 12, shadowMap: 1024 });
    this.sun = this.look.sun;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 400; this.sun.shadow.bias = -0.0003; this.sun.shadow.normalBias = 0.04;
    // warm kicker from camera side so backlit hulls keep their white
    this.kicker = new THREE.DirectionalLight(0xffe2c0, 0.5); scene.add(this.kicker, this.kicker.target); this.own.push(this.kicker, this.kicker.target);
    this.rim = new THREE.DirectionalLight(0x86b8ff, 1.2); scene.add(this.rim, this.rim.target); this.own.push(this.rim, this.rim.target);

    // planet
    const preset = resolvePreset(THREE, CINE_PRESET);
    this.planet = makePlanet({ radius: PLANET_R, seed: 7, preset }); this.planet.position.copy(PLANET_POS); scene.add(this.planet); this.own.push(this.planet);
    // art-direction cheat: light the planet from the side so a terminator, ocean glint and night-side cities are in frame
    this.planet.lightDir = new THREE.Vector3(0.92, 0.2, 0.25).normalize(); this.planet.setPreset(preset);

    // actors
    this.mats = makeMaterials(rng);
    this.arwings = [];
    for (let i = 0; i < 4; i++) { const a = makeArwing(); a.visible = false; scene.add(a); this.arwings.push(a); this.own.push(a); }
    this.greatFox = buildGreatFox(this.mats); this.greatFox.visible = false; scene.add(this.greatFox); this.own.push(this.greatFox);
    this.hangar = buildHangar(this.mats); this.hangar.visible = false; scene.add(this.hangar); this.own.push(this.hangar);

    // camera rig state
    this.rig = { pos: new THREE.Vector3(0, 2, 10), look: new THREE.Vector3(0, 0, 0), fov: 50, roll: 0, shake: 0, lambda: 0, cut: true };
    this._p = new THREE.Vector3(); this._l = new THREE.Vector3(); this._dt = 1 / 60;
    this.time = 0;
    // Shadow pass at half rate: the hero-framed shadow frustum re-renders all in-frustum
    // casters each frame; at 30 Hz the lag is invisible on cinematic moves.
    this._shadowAuto0 = ctx.renderer.shadowMap.autoUpdate;
    ctx.renderer.shadowMap.autoUpdate = false;
    this._shadowTick = 0;

    // post
    const { bloom } = ctx;
    this._bloom = { s: bloom.strength, r: bloom.radius, t: bloom.threshold };
    this.bloomBoost = 0; this.exposure = 1.0;
    window.__stage = this; // debug hook
  }

  /** Camera rig: cut (lambda=0) or damped follow. */
  cam(pos, look, fov = 50, { lambda = 0, roll = 0, shake = 0 } = {}) {
    this.rig.lambda = lambda; this.rig.fov = fov; this.rig.roll = roll; this.rig.shake = shake;
    if (lambda <= 0 || this.rig.cut) { this.rig.cut = false; this.rig.pos.copy(pos); this.rig.look.copy(look); }
    else { this.rig.pos.lerp(pos, 1 - Math.exp(-lambda * this._dt)); this.rig.look.lerp(look, 1 - Math.exp(-lambda * 1.6 * this._dt)); }
  }
  /** Next cam() call snaps instead of damping (hard cut). */
  cut() { this.rig.cut = true; }
  /** Centre shadow frustum + kicker/rim lights on an object. */
  focus(obj, size = 12, { kicker = 0.5, rim = 1.2, sunDir = SUN_DIR } = {}) {
    this.kicker.intensity = kicker; this.rim.intensity = rim;
    const p = obj.getWorldPosition(this._p);
    this.sun.target.position.copy(p); this.sun.position.copy(p).addScaledVector(sunDir, 120);
    const sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - size) > 1e-3) { sc.left = sc.bottom = -size; sc.right = sc.top = size; sc.updateProjectionMatrix(); }
    // kicker: from camera, slightly above / right
    this.kicker.target.position.copy(p);
    this.kicker.position.copy(this.camera.position).sub(p).normalize().add(this._l.set(0.5, 0.6, 0)).normalize().multiplyScalar(60).add(p);
    this.rim.target.position.copy(p);
    this.rim.position.copy(PLANET_DIR).multiplyScalar(-1).add(this._l.set(0, 0.2, 0)).normalize().multiplyScalar(60).add(p);
  }
  hideAll() { this.arwings.forEach((a) => { a.visible = false; a.rotation.set(0, 0, 0); a.scale.setScalar(1); a.userData.api.setHover(0); a.userData.api.flap(0); a.userData.api.setBank(0); }); this.greatFox.visible = false; this.hangar.visible = false; this.planet.visible = true; }

  update(dt, t) {
    this._dt = dt; this.time = t;
    this.ctx.renderer.shadowMap.needsUpdate = (this._shadowTick++ & 1) === 0;
    // Harness (fixed-step) mode: force a GPU sync per frame so the post-process work of
    // stepped frames is paid inside stepFrames() rather than piling up into the screenshot.
    if (this.ctx.engine?.fixedStep) {
      const gl = this.ctx.renderer.getContext();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this._px ??= new Uint8Array(4));
    }
    const cam = this.camera;
    const sh = this.rig.shake;
    const n1 = Math.sin(t * 13.1) * 0.6 + Math.sin(t * 29.7) * 0.4, n2 = Math.cos(t * 11.3) * 0.6 + Math.sin(t * 31.1) * 0.4;
    cam.position.copy(this.rig.pos);
    this._l.copy(this.rig.look);
    cam.up.set(Math.sin(this.rig.roll), Math.cos(this.rig.roll), 0);
    cam.lookAt(this._l);
    cam.rotateX(n1 * sh * 0.004); cam.rotateY(n2 * sh * 0.004);
    if (Math.abs(cam.fov - this.rig.fov) > 1e-3) { cam.fov = this.rig.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    this.arwings.forEach((a) => { if (a.visible) a.userData.tick(dt, t, cam); }); this.greatFox.userData.tick(t);
    this.planet.update(dt, t);
    this.look.update(dt, t);
    this.ctx.renderer.toneMappingExposure = this.exposure;
    this.ctx.bloom.strength = CINE_PRESET.bloom.strength + this.bloomBoost;
  }

  dispose() {
    const { bloom, scene, renderer } = this.ctx;
    renderer.shadowMap.autoUpdate = this._shadowAuto0; renderer.shadowMap.needsUpdate = true;
    bloom.strength = this._bloom.s; bloom.radius = this._bloom.r; bloom.threshold = this._bloom.t;
    renderer.toneMappingExposure = 1;
    // Only tear down what this stage created: lookdev look (lights/env/sky/grade), the planet,
    // the four Arwings, the Great Fox and the hangar set. Other pieces' scene content is untouched.
    this.look.dispose(); this.planet.disposePlanet();
    this.arwings.forEach((a) => a.userData.api.dispose());
    const seen = new Set();
    for (const root of [this.greatFox, this.hangar]) root.traverse((o) => { if (o.isMesh || o.isSprite) { o.geometry?.dispose?.(); for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m && !seen.has(m)) { seen.add(m); m.map?.dispose?.(); m.emissiveMap?.dispose?.(); m.roughnessMap?.dispose?.(); m.dispose(); } } });
    for (const m of Object.values(this.mats)) if (m?.isMaterial && !seen.has(m)) { seen.add(m); m.map?.dispose?.(); m.emissiveMap?.dispose?.(); m.dispose(); }
    for (const o of this.own) scene.remove(o);
    this.own.length = 0;
    if (window.__stage === this) delete window.__stage;
    this.camera.up.set(0, 1, 0); this.camera.near = this._cam0.near; this.camera.far = this._cam0.far; this.camera.fov = this._cam0.fov; this.camera.updateProjectionMatrix();
  }
}

/* ------------------------------------------------------------------ */
/* Sequences                                                           */
/* ------------------------------------------------------------------ */
const V = () => new THREE.Vector3();
const tmpA = V(), tmpB = V(), tmpC = V(), tmpD = V(), tmpE = V(), tmpF = V(), aimTmp = V(), UP = new THREE.Vector3(0, 1, 0);

/** Orient a nose(-Z) ship along dir with bank roll. */
function aim(ship, dir, bank = 0) {
  aimTmp.copy(ship.position).sub(dir);
  ship.up.set(0, 1, 0); ship.lookAt(aimTmp); ship.rotateZ(bank);
}

/**
 * Title screen. opts: { auto?: boolean (alias skipAfter=3.4), skipAfter?: seconds — auto-confirm
 * after this many seconds (Infinity/undefined = wait for the player), onConfirm?: () => void —
 * fired the frame the player presses start (before the ~1s flash-out; the promise resolves after). }
 */
function titleSeq(st, ov, { auto = false, skipAfter, onConfirm } = {}) {
  const hero = st.arwings[0], gf = st.greatFox;
  const skipAt = skipAfter ?? (auto ? 3.4 : Infinity);
  let confirmed = -1;
  // basis: camera sits opposite the planet so the planet limb fills the lower frame
  const back = PLANET_DIR.clone().negate();                 // from planet toward camera
  const right = new THREE.Vector3().crossVectors(back, UP).normalize();
  const up = new THREE.Vector3().crossVectors(right, back).normalize();
  const heroDir = new THREE.Vector3();
  return {
    name: 'title', dur: Infinity,
    start() {
      st.hideAll(); hero.visible = true; gf.visible = true;
      hero.userData.api.setHover(1); hero.userData.api.setThrust(0.45);
      ov.letterbox(false, 0.6);
      ov.setLogo(0, 1.6); ov.setSub(0); ov.setPress(0); ov.setCopy(0); ov.setBig(0); ov.setTally(0); ov.setCaption(0);
      ov.setFade(1);
      st.exposure = 0.82;
    },
    update(t, dt, input) {
      // hero arwing: 3/4 front view, slow drift, gentle bank
      const yaw = -0.75 + Math.sin(t * 0.21) * 0.2, bob = Math.sin(t * 0.9) * 0.12;
      hero.position.set(0, bob, 0);
      heroDir.copy(back).applyAxisAngle(up, yaw).applyAxisAngle(right, -0.12);
      aim(hero, heroDir, Math.sin(t * 0.45) * 0.18 + 0.12);
      hero.userData.api.flap(-0.2 + Math.sin(t * 0.6) * 0.15);
      // great fox in the far distance, cruising toward the planet
      gf.position.copy(PLANET_DIR).multiplyScalar(330).addScaledVector(right, 150 - t * 1.6).addScaledVector(up, -8);
      aim(gf, PLANET_DIR, 0.06); gf.rotateY(0.35); gf.userData.setPower(1.2);
      // camera: slow arc, planet behind hero
      const a = Math.sin(t * 0.07) * 0.10 - 0.42;
      const dist = 12.5 - Math.min(t, 8) * 0.12;
      const pos = tmpA.copy(back).applyAxisAngle(up, a).multiplyScalar(dist).addScaledVector(up, 1.4 + Math.sin(t * 0.3) * 0.15);
      const look = tmpB.copy(up).multiplyScalar(0.7).addScaledVector(right, 0.6);
      st.cam(pos, look, 42, { lambda: 0, roll: 0.015 * Math.sin(t * 0.4), shake: 0.25 });
      st.focus(hero, 6);
      // UI choreography
      ov.setFade(1 - seg(t, 0.0, 1.1, Ease.outCubic));
      const lin = seg(t, 0.35, 1.25, Ease.outBack);
      const glow = 1 + smoothstep(0.35, 0.9, t) * (1 - smoothstep(0.9, 1.6, t)) * 1.4;
      let logoScale = lerp(1.8, 1.0, lin), logoAlpha = seg(t, 0.35, 0.8, Ease.outQuad), logoY = 27;
      ov.setSub(seg(t, 1.2, 1.8));
      ov.setCopy(seg(t, 1.6, 2.2));
      const pulse = 0.55 + 0.45 * Math.sin(t * 3.4) ** 2;
      let press = seg(t, 1.7, 2.1) * pulse;
      if (confirmed >= 0) {
        const c = t - confirmed;
        press = c < 0.6 ? (Math.floor(c * 16) % 2 ? 1 : 0.15) : 0;
        ov.setFlash(0.55 * (1 - seg(c, 0, 0.35, Ease.outQuad)));
        logoScale *= 1 + Ease.inCubic(clamp01(c / 0.9)) * 0.35; logoAlpha *= 1 - seg(c, 0.35, 0.9);
        ov.setSub(1 - seg(c, 0.1, 0.4)); ov.setCopy(0);
        ov.setFade(seg(c, 0.55, 1.0, Ease.inQuad));
        hero.userData.api.setThrust(1);
        if (c > 1.0) return true;
      } else if (t > 1.2 && (input.wasPressed('confirm') || input.wasPressed('fire') || t > skipAt)) {
        confirmed = t; st.ctx.audio.tone({ type: 'square', f0: 880, f1: 1320, dur: 0.18, gain: 0.15 });
        try { onConfirm?.(); } catch (e) { console.warn('cinematics: onConfirm threw', e); }
      }
      ov.setLogo(logoAlpha, logoScale, logoY, glow);
      ov.setPress(press);
      return false;
    },
  };
}

function introSeq(st, ov) {
  const gf = st.greatFox, hangar = st.hangar, aw = st.arwings;
  const A_END = 3.6, B_END = 6.8, C_END = 10.2;
  // Shot A: the Great Fox cruises toward the planet; the camera is rigged in SHIP space and
  // slides from under the cannon prongs back along the flank to the engines, so the hull
  // fills the frame from a low angle the whole way.
  const gfTrack = [{ t: 0, v: [10, 4, 80] }, { t: A_END, v: [-6, -2, -240], ease: Ease.linear }];
  const gfDir = new THREE.Vector3(gfTrack[1].v[0] - gfTrack[0].v[0], gfTrack[1].v[1] - gfTrack[0].v[1], gfTrack[1].v[2] - gfTrack[0].v[2]).normalize();
  const camLocal = [{ t: 0, v: [28, -17, -104] }, { t: A_END, v: [62, -17, 14], ease: Ease.inOutSine }];
  const lookLocal = [{ t: 0, v: [-2, -4, -48] }, { t: A_END * 0.55, v: [0, -2, -12], ease: Ease.inOutSine }, { t: A_END, v: [-4, 2, 4], ease: Ease.inOutSine }];
  const keyA = new THREE.Vector3(0.75, 0.55, -0.3).normalize(); // shot-A key light: upper-front, camera side
  const keyC = new THREE.Vector3(-0.45, 0.5, -0.74).normalize(); // shot-C key: planet-shine from ahead so the bay face is lit
  const keyB = new THREE.Vector3(); // shot-B key: sunlight streaming in through the bay mouth (set in start())
  let shot = -1;
  const launchT = [0.7, 1.25, 1.8, 2.35]; // per ship launch time inside shot B
  const hangarQ = new THREE.Quaternion();
  return {
    name: 'intro', dur: C_END,
    start() {
      st.hideAll(); ov.letterbox(true, 0.9); ov.setFade(1); ov.setFlash(0); ov.setLogo(0); ov.setPress(0); ov.setSub(0); ov.setCopy(0);
      ov.caption('MISSION 1', 'CORNERIA'); ov.setCaption(0, 1, 0);
      // hangar faces the planet
      hangar.position.set(0, 0, 0);
      hangar.lookAt(PLANET_POS); hangar.rotateY(Math.PI); // hangar's -Z toward planet
      hangarQ.copy(hangar.quaternion);
      keyB.set(0.35, 0.3, -1).applyQuaternion(hangarQ).normalize();
    },
    update(t, dt) {
      if (t < A_END) {
        // ---- Shot A: Great Fox fly-by, camera pans to follow
        if (shot !== 0) { shot = 0; gf.visible = true; hangar.visible = false; aw.forEach((a) => (a.visible = false)); st.cut(); }
        evalTrack(gfTrack, t, gf.position);
        aim(gf, gfDir, -0.10 + Math.sin(t * 0.7) * 0.02); gf.userData.setPower(1.4);
        gf.updateMatrixWorld();
        evalTrack(camLocal, t, tmpA); gf.localToWorld(tmpA);
        evalTrack(lookLocal, t, tmpB); gf.localToWorld(tmpB);
        const fov = evalScalar([{ t: 0, v: 46 }, { t: A_END, v: 52, ease: Ease.inOutSine }], t);
        st.cam(tmpA, tmpB, fov, { lambda: 0, roll: -0.14 + seg(t, 0, A_END, Ease.inOutSine) * 0.2, shake: 0.5 });
        st.focus(gf, 90, { kicker: 0.5, rim: 1.8, sunDir: keyA });
        ov.setFade(1 - seg(t, 0, 0.8, Ease.outCubic) + seg(t, A_END - 0.25, A_END, Ease.inQuad));
        st.exposure = 0.8;
      } else if (t < B_END) {
        // ---- Shot B: hangar bay, Arwings launch with anticipation
        const u = t - A_END, len = B_END - A_END;
        if (shot !== 1) {
          shot = 1; gf.visible = false; hangar.visible = true;
          aw.forEach((a) => { a.visible = true; a.scale.setScalar(1); a.userData.api.setHover(0); a.userData.api.flap(1); a.userData.api.setThrust(0.1); });
          st.cut();
        }
        const D = hangar.userData.dims, restY = D.cradleTop + 0.95;
        const slots = [[D.lanes[0], restY, 12], [D.lanes[1], restY, 12], [D.lanes[0], restY, 24], [D.lanes[1], restY, 24]];
        aw.forEach((a, i) => {
          const s = slots[i], lt = launchT[i], k = u - lt;
          let z = s[2], y = s[1], power = 0.1, pitch = 0;
          if (k > -0.45 && k < 0) { const q = 1 + k / 0.45; z += Ease.inOutSine(q) * 1.1; y -= 0.2 * Math.sin(q * Math.PI); power = 0.1 + q * 0.8; pitch = -0.06 * q; a.userData.api.flap(1 - Ease.inOutCubic(q) * 1.2); } // anticipation: squat, creep back, wings deploy
          else if (k >= 0) { const q = k; z = s[2] - 320 * Ease.inCubic(clamp01(q / 1.4)) - Math.max(0, q - 1.4) * 340; y += Ease.outQuad(clamp01(q / 0.5)) * 2.2; power = 1; pitch = 0.1 * (1 - clamp01(q / 0.6)); a.userData.api.flap(-0.2); }
          tmpA.set(s[0], y, z); hangar.localToWorld(tmpA); a.position.copy(tmpA);
          a.quaternion.copy(hangarQ); a.rotateX(pitch); a.rotateZ(Math.sin(u * 2 + i) * 0.01);
          a.userData.setPower(power);
        });
        // camera: deck-level, offset into the left lane so the near Arwing fills the foreground and the
        // far pair + bay mouth sit on the right third; slow push in, small kick on each launch
        let kick = 0; launchT.forEach((lt) => { const k = u - lt; if (k > 0 && k < 0.4) kick += Math.sin(k / 0.4 * Math.PI) * 0.5; });
        const push = seg(u, 0, len, Ease.inOutSine);
        const pos = tmpA.set(-1.6 + Math.sin(u * 0.4) * 0.3, D.FLOOR + 2.4 + push * 1.6, 35.5 - push * 8);
        const look = tmpB.set(0.8, D.FLOOR + 3.0 - kick * 0.4, -60);
        hangar.localToWorld(pos); hangar.localToWorld(look);
        st.cam(pos, look, 50 + kick * 3, { lambda: 3.5, roll: -0.02 + kick * 0.02, shake: 0.8 + kick * 3 });
        st.focus(aw[2], 30, { kicker: 0.25, rim: 0.6, sunDir: keyB });
        ov.setFlash(kick * 0.12);
        ov.setFade(1 - seg(u, 0, 0.5, Ease.outCubic) + seg(u, len - 0.2, len, Ease.inQuad));
        st.exposure = 0.9;
      } else {
        // ---- Shot C: exterior — Arwings pour out of the bay, peel into formation; level-start pan + caption
        const u = t - B_END, len = C_END - B_END;
        if (shot !== 2) { shot = 2; hangar.visible = false; gf.visible = true; gf.position.set(0, 0, 0); gf.quaternion.copy(hangarQ); gf.userData.setPower(1.2); aw.forEach((a) => { a.userData.api.flap(0); a.userData.api.setThrust(1); }); st.cut(); }
        const fwd = tmpE.set(0, 0, -1).applyQuaternion(hangarQ);
        const right = tmpF.set(1, 0, 0).applyQuaternion(hangarQ);
        gf.updateMatrixWorld();
        const bayW = gf.localToWorld(tmpD.copy(gf.userData.bay)); // chin bay mouth (world)
        aw.forEach((a, i) => {
          a.visible = true;
          const k = u + 0.3 - i * 0.28;
          const dist = 6 + Math.max(0, k) * 48 + Math.max(0, k - 1.5) * 30;
          const spread = smoothstep(0.2, 1.6, k) * (i % 2 ? 1 : -1) * (7 + Math.floor(i / 2) * 7) * 1.2;
          const rise = smoothstep(0.2, 1.8, k) * (-6 + Math.floor(i / 2) * 9);
          a.position.copy(bayW).addScaledVector(fwd, dist).addScaledVector(right, spread).add(tmpA.set(0, rise, 0));
          const dir = tmpB.copy(fwd).addScaledVector(right, smoothstep(0.2, 1.2, k) * (1 - smoothstep(1.2, 2.2, k)) * (i % 2 ? 0.25 : -0.25));
          const bank = (i % 2 ? -1 : 1) * Math.sin(clamp01(k / 2.2) * Math.PI) * 0.9;
          aim(a, dir, bank);
          a.userData.setPower(2.2);
        });
        // crane: hangs low beside the Great Fox's chin, watching the Arwings burst out of the bay and
        // stream past; then swings to follow the squadron toward the planet
        const camK = seg(u, 0.7, 2.8, Ease.inOutSine);
        const pos = tmpA.copy(bayW).addScaledVector(fwd, 30 + camK * 64).addScaledVector(right, -24 - camK * 8).add(tmpB.set(0, -9 - camK * 3, 0));
        const toBay = tmpB.copy(bayW).addScaledVector(fwd, 4).sub(pos).normalize();
        const lookDir = toBay.lerp(fwd, camK).normalize();
        const look = tmpC.copy(pos).addScaledVector(lookDir, 60).add(tmpD.set(0, -camK * 6, 0));
        st.cam(pos, look, 46 - camK * 8, { lambda: 3.0, roll: -0.05 + camK * 0.08, shake: 0.5 });
        st.focus(aw[0], 30, { kicker: 0.6, rim: 1.4, sunDir: keyC });
        ov.setFade(1 - seg(u, 0, 0.5, Ease.outCubic) + seg(u, len - 0.5, len, Ease.inQuad));
        const cap = seg(u, 1.0, 1.7, Ease.outCubic);
        ov.setCaption(cap * (1 - seg(u, len - 0.55, len - 0.2)), 1 - Ease.outBack(cap), seg(u, 1.3, 2.2, Ease.outQuart));
        st.exposure = 0.85;
      }
      return t >= C_END;
    },
  };
}

function completeSeq(st, ov, stats) {
  const aw = st.arwings, DUR = 6.4;
  const s = { score: 12480, hits: 64, accuracy: 0.87, bonus: 5000, ...stats };
  const rows = [
    { label: 'ENEMIES DOWNED', value: s.hits, format: (v) => `${v}` },
    { label: 'ACCURACY', value: Math.round(s.accuracy * 100), format: (v) => `${v}%` },
    { label: 'WING BONUS', value: s.bonus, format: (v) => v.toLocaleString('en-US') },
    { label: 'TOTAL', value: s.score, format: (v) => v.toLocaleString('en-US'), total: true },
  ];
  let dinged = false;
  return {
    name: 'complete', dur: DUR,
    start() {
      st.hideAll(); ov.letterbox(true, 0.9); ov.setFade(1); ov.setCaption(0);
      ov.buildTally(rows); ov.setTally(0); ov.setBig(0, 1.4);
      aw.forEach((a) => { a.visible = true; a.scale.setScalar(1); a.userData.api.setHover(0); a.userData.api.setThrust(0.6); });
      st.exposure = 0.88;
    },
    update(t, dt) {
      // squadron flies away from camera toward the planet; lead does a victory barrel roll then boosts off.
      // LAYOUT: the ships + planet live in the left ~55% of frame, below the title; the score card
      // owns the right third. The camera's look point is pushed right/up of the flight line so the
      // squadron's vanishing point sits at ~(32%, 62%) of the screen and never crosses the type.
      const dir = tmpE.copy(PLANET_DIR);
      const right = tmpF.crossVectors(dir, UP).normalize();
      const up = tmpD.crossVectors(right, dir).normalize();
      const offs = [[0, 0], [-1, -0.45], [1, -0.45], [0, -1.0]];
      aw.forEach((a, i) => {
        const boostK = seg(t, 2.4 + i * 0.15, 4.6 + i * 0.15, Ease.inCubic);
        const d = 16 + t * 5 + boostK * 420;
        const wob = Math.sin(t * 1.3 + i) * 0.3;
        const rollK = i === 0 ? seg(t, 0.8, 2.2, Ease.inOutSine) : 0;
        a.position.copy(dir).multiplyScalar(d).addScaledVector(right, (offs[i][0] * 6) * (1 + boostK * 0.6)).addScaledVector(up, offs[i][1] * 3.5 + wob + Math.sin(rollK * Math.PI) * 1.8);
        const bank = i === 0 ? -rollK * Math.PI * 2 : Math.sin(t * 1.1 + i) * 0.08;
        aim(a, dir, bank);
        a.userData.api.setThrust(0.6 + boostK * 0.4);
        if (i === 0) a.userData.api.flap(Math.sin(rollK * Math.PI) * 0.8);
      });
      // camera: trails low and slightly left of the squadron, then gently pulls back and lets them go
      const pull = seg(t, 2.2, 5.5, Ease.inOutSine);
      const pos = tmpA.copy(dir).multiplyScalar(-2 - pull * 6).addScaledVector(right, -1 - pull * 1).addScaledVector(up, 1.0 + pull * 0.8);
      // look point offset right (+) and up (+) of the flight line => ships render left / low
      const look = tmpB.copy(pos).addScaledVector(dir, 60).addScaledVector(right, 17 + pull * 3).addScaledVector(up, 5.5 + pull * 1.5);
      st.cam(pos, look, 48 - pull * 6, { lambda: 3.5, roll: 0.02 - pull * 0.02, shake: 0.4 });
      st.focus(aw[0], 16);
      st.bloomBoost = seg(t, 2.6, 4.2, Ease.outQuad) * 0.25;
      // UI
      ov.setFade(1 - seg(t, 0, 0.7, Ease.outCubic) + seg(t, DUR - 0.5, DUR, Ease.inQuad));
      const bigIn = seg(t, 0.55, 1.15, Ease.outBack);
      ov.setBig(seg(t, 0.55, 0.8), lerp(1.5, 1.0, bigIn) * (1 + Math.sin(t * 2) * 0.004));
      ov.setTally(seg(t, 1.1, 1.5));
      ov.tickTally(seg(t, 1.3, 4.6, Ease.linear));
      if (t > 4.6 && !dinged) { dinged = true; st.ctx.audio.tone({ type: 'triangle', f0: 660, f1: 990, dur: 0.35, gain: 0.15 }); }
      if (t >= DUR) st.bloomBoost = 0;
      return t >= DUR;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Director + piece                                                    */
/* ------------------------------------------------------------------ */
class Director {
  constructor(ctx) {
    this.ctx = ctx;
    this.stage = new Stage(ctx);
    this.overlay = new Overlay(ctx.ui);
    this.seq = null; this.seqT = 0; this._resolve = null;
    this.queue = [];
  }
  /** Run a sequence; resolves when it finishes. Chained synchronously via queue for determinism. */
  run(seq) {
    return new Promise((resolve) => { this.queue.push({ seq, resolve }); if (!this.seq) this._next(); });
  }
  _next() {
    const n = this.queue.shift(); if (!n) { this.seq = null; return; }
    this.seq = n.seq; this._resolve = n.resolve; this.seqT = 0; this.seq.start();
    this.ctx.events.emit('cinematic:start', this.seq.name);
  }
  update(dt, t) {
    // Cinematics are wall-clock driven when running live (the engine clamps dt to 50ms,
    // which would stretch a 10s cinematic to minutes on a slow/software GPU); the
    // fixed-step harness keeps its deterministic dt.
    if (!this.ctx.engine?.fixedStep) {
      const now = performance.now() / 1000;
      dt = this._wall == null ? dt : Math.min(0.5, Math.max(0, now - this._wall));
      this._wall = now;
    }
    this.overlay.update(dt);
    if (this.seq) {
      this.seqT += dt;
      const done = this.seq.update(this.seqT, dt, this.ctx.input);
      if (done) {
        const r = this._resolve; const name = this.seq.name; this.seq = null;
        this.ctx.events.emit('cinematic:end', name);
        this._next(); r?.();
        this.onSeqEnd?.(name);
      }
    }
    this.stage.update(dt, t);
  }
  dispose() { this.overlay.dispose(); this.stage.dispose(); }
}

let director = null;
function getDirector(ctx) { return director ?? (director = new Director(ctx)); }

/** Title screen; resolves when the player confirms and the flash-out finishes.
 *  opts: { skipAfter?: seconds (auto-confirm), auto?: boolean (= skipAfter 3.4), onConfirm?: () => void }. */
export function playTitle(ctx, opts = {}) { return getDirector(ctx).run(titleSeq(director.stage, director.overlay, opts)); }
/** Intro: Great Fox fly-by -> hangar launch -> letterboxed level-start pan with caption. */
export function playIntro(ctx) { return getDirector(ctx).run(introSeq(director.stage, director.overlay)); }
/** Mission complete: fly-away + score tally. stats = { score, hits, accuracy, bonus }. */
export function playComplete(ctx, stats) { return getDirector(ctx).run(completeSeq(director.stage, director.overlay, stats)); }
/** Tear down the shared cinematic stage (call when leaving cinematics for gameplay). */
export function disposeCinematics() { director?.dispose(); director = null; }
/** The shared director (created on demand); the integrator drives `director.update(dt, t)` each frame. */
export function getCinematics(ctx) { return getDirector(ctx); }

export async function create(ctx) {
  director = new Director(ctx);
  const d = director;
  // showcase: title -> intro -> complete -> loop. Chained synchronously so the
  // headless fixed-step harness never sees an idle frame between sequences.
  // (?cin=intro|complete starts the loop at that sequence — handy for iteration.)
  const show = ['title', 'intro', 'complete'];
  const startAt = new URLSearchParams(location.search).get('cin');
  let idx = Math.max(0, show.indexOf(startAt));
  const startNext = () => {
    const which = show[idx % show.length]; idx++;
    const seq = which === 'title' ? titleSeq(d.stage, d.overlay, { auto: true }) : which === 'intro' ? introSeq(d.stage, d.overlay) : completeSeq(d.stage, d.overlay, { score: 12480, hits: 64, accuracy: 0.87, bonus: 5000 });
    d.queue.push({ seq, resolve: null }); if (!d.seq) d._next();
  };
  d.onSeqEnd = () => { if (!d.seq) startNext(); };
  startNext();
  window.__cine = d; // debug hook

  // autoplay script: press start on the title, otherwise hands off
  ctx.input.script = (t) => ({ x: 0, y: 0, buttons: t > 3.4 && t < 3.6 ? ['confirm'] : [] });

  return {
    update(dt, t) { d.update(dt, t); },
    dispose() { d.dispose(); if (director === d) director = null; },
  };
}
