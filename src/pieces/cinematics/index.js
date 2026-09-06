// PIECE: cinematics — title screen, intro (Great Fox fly-by + hangar launch),
// level-start letterboxed pan, mission-complete fly-away with score tally.
//
// Exports: create(ctx) (showcase autoplays title -> intro -> complete), and
// playTitle(ctx), playIntro(ctx), playComplete(ctx, stats) which return promises.
import * as THREE from 'three';
import { Ease, seg, evalTrack, evalScalar, clamp01, lerp, damp, smoothstep } from './tween.js';
import { makeSky, makeSkyMaterial, bakeSkyTexture, makeStars, makePlanet, makeSunSprite, makeMaterials, buildArwing, buildGreatFox, buildHangar } from './assets.js';
import { Overlay } from './overlay.js';

export { buildArwing, buildGreatFox, makePlanet, makeSky, makeStars } from './assets.js';

const SUN_DIR = new THREE.Vector3(0.4, 0.3, -0.8).normalize();
const PLANET_POS = new THREE.Vector3(560, -260, -1500);

/* ------------------------------------------------------------------ */
/* Stage: shared scene setup for all cinematics                        */
/* ------------------------------------------------------------------ */
class Stage {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, renderer, rng, camera } = ctx;
    this.scene = scene; this.camera = camera;
    camera.near = 0.1; camera.far = 6000; camera.updateProjectionMatrix();

    // environment map from the procedural sky (specular/fresnel response)
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), makeSkyMaterial({ uBoost: { value: 1.6 } }));
    envScene.add(envSky);
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 6.5, 5) }));
    sunBall.position.copy(SUN_DIR).multiplyScalar(80); envScene.add(sunBall);
    const fillBall = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.7, 1.6) }));
    fillBall.position.set(30, -60, -50); envScene.add(fillBall);
    this.envMap = pm.fromScene(envScene, 0.02).texture;
    pm.dispose(); envSky.material.dispose(); envSky.geometry.dispose();

    this.mats = makeMaterials(rng, this.envMap);

    // world dressing
    this.skyBake = bakeSkyTexture(renderer);
    this.sky = makeSky(2800, this.skyBake.texture); scene.add(this.sky);
    this.stars = makeStars(rng); scene.add(this.stars);
    this.planet = makePlanet(renderer, 400); this.planet.position.copy(PLANET_POS); scene.add(this.planet);
    this.sun = makeSunSprite(700); this.sun.position.copy(SUN_DIR).multiplyScalar(2500); scene.add(this.sun);

    // lights
    this.key = new THREE.DirectionalLight(0xfff0dc, 3.2); this.key.position.copy(SUN_DIR).multiplyScalar(200);
    this.key.castShadow = true; this.key.shadow.mapSize.set(1024, 1024); this.key.shadow.bias = -0.0005; this.key.shadow.normalBias = 0.02;
    const sc = this.key.shadow.camera; sc.near = 50; sc.far = 400; sc.left = sc.bottom = -40; sc.right = sc.top = 40;
    this.keyTarget = new THREE.Object3D(); scene.add(this.keyTarget); this.key.target = this.keyTarget; scene.add(this.key);
    this.fill = new THREE.DirectionalLight(0x5f8fff, 0.9); this.fill.position.set(PLANET_POS.x, PLANET_POS.y, PLANET_POS.z).normalize().multiplyScalar(100); scene.add(this.fill);
    this.rim = new THREE.DirectionalLight(0xff9a70, 0.7); this.rim.position.set(-80, -30, 60); scene.add(this.rim);
    this.amb = new THREE.AmbientLight(0x1a2442, 1.0); scene.add(this.amb);
    scene.environment = this.envMap;

    // actors
    this.arwings = [];
    for (let i = 0; i < 4; i++) { const a = buildArwing(this.mats); a.visible = false; scene.add(a); this.arwings.push(a); }
    this.greatFox = buildGreatFox(this.mats); this.greatFox.visible = false; scene.add(this.greatFox);
    this.hangar = buildHangar(this.mats); this.hangar.visible = false; scene.add(this.hangar);

    // camera rig state
    this.rig = { pos: new THREE.Vector3(0, 2, 10), look: new THREE.Vector3(0, 0, 0), fov: 50, roll: 0, shake: 0, lambda: 0, cut: true };
    this._p = new THREE.Vector3(); this._l = new THREE.Vector3(); this._dt = 1 / 60;
    this.time = 0;

    // post
    const { bloom } = ctx;
    this._bloom = { s: bloom.strength, r: bloom.radius, t: bloom.threshold };
    bloom.strength = 0.85; bloom.radius = 0.55; bloom.threshold = 0.72;
    this.bloomBoost = 0;
    this.exposure = 1.0;
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
  focusShadow(obj, size = 40) {
    this.keyTarget.position.copy(obj.getWorldPosition(this._p));
    this.key.position.copy(this.keyTarget.position).addScaledVector(SUN_DIR, 200);
    const sc = this.key.shadow.camera; sc.left = sc.bottom = -size; sc.right = sc.top = size; sc.updateProjectionMatrix();
  }
  hideAll() { this.arwings.forEach((a) => { a.visible = false; a.rotation.set(0, 0, 0); a.scale.setScalar(1); }); this.greatFox.visible = false; this.hangar.visible = false; this.planet.visible = true; this.sun.visible = true; }

  update(dt, t) {
    this._dt = dt; this.time = t;
    this.stars.material.uniforms.uTime.value = t;
    this.arwings.forEach((a) => a.userData.tick(t)); this.greatFox.userData.tick(t);
    // camera
    const cam = this.camera;
    const sh = this.rig.shake;
    const n1 = Math.sin(t * 13.1) * 0.6 + Math.sin(t * 29.7) * 0.4, n2 = Math.cos(t * 11.3) * 0.6 + Math.sin(t * 31.1) * 0.4;
    cam.position.copy(this.rig.pos);
    this._l.copy(this.rig.look);
    cam.up.set(Math.sin(this.rig.roll), Math.cos(this.rig.roll), 0);
    cam.lookAt(this._l);
    cam.rotateX(n1 * sh * 0.004); cam.rotateY(n2 * sh * 0.004);
    if (Math.abs(cam.fov - this.rig.fov) > 1e-3) { cam.fov = this.rig.fov; cam.updateProjectionMatrix(); }
    // sky + stars follow camera (infinite distance)
    this.sky.position.copy(cam.position); this.stars.position.copy(cam.position);
    this.sun.position.copy(cam.position).addScaledVector(SUN_DIR, 2500);
    this.ctx.renderer.toneMappingExposure = this.exposure;
    this.ctx.bloom.strength = 0.85 + this.bloomBoost;
  }

  dispose() {
    const { bloom, scene, renderer } = this.ctx;
    bloom.strength = this._bloom.s; bloom.radius = this._bloom.r; bloom.threshold = this._bloom.t;
    renderer.toneMappingExposure = 1;
    scene.environment = null;
    scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map?.dispose?.(); m.emissiveMap?.dispose?.(); m.dispose(); }); });
    scene.clear();
    this.envMap.dispose(); this.skyBake.dispose(); this.planet.userData.dispose();
    this.camera.up.set(0, 1, 0); this.camera.fov = 60; this.camera.updateProjectionMatrix();
  }
}

/* ------------------------------------------------------------------ */
/* Sequences                                                           */
/* ------------------------------------------------------------------ */
const V = () => new THREE.Vector3();
const tmpA = V(), tmpB = V(), tmpC = V(), tmpD = V(), tmpE = V(), tmpF = V(), aimTmp = V();

/** Orient a nose(-Z) ship along dir with bank roll. */
function aim(ship, dir, bank = 0) {
  aimTmp.copy(ship.position).sub(dir);
  ship.up.set(0, 1, 0); ship.lookAt(aimTmp); ship.rotateZ(bank);
}

function titleSeq(st, ov, { auto = false } = {}) {
  const hero = st.arwings[0], gf = st.greatFox;
  let confirmed = -1;
  return {
    name: 'title', dur: Infinity,
    start() {
      st.hideAll(); hero.visible = true; gf.visible = true; st.planet.visible = true;
      ov.letterbox(false, 0.6);
      ov.setLogo(0, 1.6); ov.setSub(0); ov.setPress(0); ov.setCopy(0); ov.setBig(0); ov.setTally(0); ov.setCaption(0);
      ov.setFade(1);
      st.exposure = 1;
    },
    update(t, dt, input) {
      // hero arwing: slow turntable drift with gentle float & idle wing flex
      const yaw = -0.55 + t * 0.12, bob = Math.sin(t * 0.9) * 0.15;
      hero.position.set(0.4, -1.6 + bob, 0);
      hero.rotation.set(Math.sin(t * 0.7) * 0.05, yaw, Math.sin(t * 0.5) * 0.12 + 0.08);
      hero.userData.setPower(0.8 + Math.sin(t * 6) * 0.1);
      hero.userData.wingL.rotation.z = 0.12 + Math.sin(t * 0.8) * 0.03; hero.userData.wingR.rotation.z = -0.12 - Math.sin(t * 0.8) * 0.03;
      // great fox in the far distance, cruising toward planet
      gf.position.set(-160 + t * 2.4, -30, -420); gf.rotation.set(0, 0.25, 0.05); gf.userData.setPower(1.2);
      // camera: slow arc
      const a = t * 0.05;
      const pos = tmpA.set(Math.sin(a) * 2.5 - 0.5, -0.4 + Math.sin(t * 0.3) * 0.2, 11.5 - Math.min(t, 6) * 0.15);
      const look = tmpB.set(0.4, -1.9, 0);
      st.cam(pos, look, 44, { lambda: 0, roll: 0.02 * Math.sin(t * 0.4), shake: 0.3 });
      st.focusShadow(hero, 8);
      // UI choreography
      ov.setFade(1 - seg(t, 0.0, 1.1, Ease.outCubic));
      const lin = seg(t, 0.35, 1.25, Ease.outBack);
      const glow = 1 + smoothstep(0.35, 0.9, t) * (1 - smoothstep(0.9, 1.6, t)) * 1.4;
      let logoScale = lerp(1.8, 1.0, lin), logoAlpha = seg(t, 0.35, 0.8, Ease.outQuad), logoY = 26;
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
        if (c > 1.0) return true;
      } else if (t > 1.2 && (input.wasPressed('confirm') || input.wasPressed('fire') || (auto && t > 3.4))) {
        confirmed = t; st.ctx.audio.tone({ type: 'square', f0: 880, f1: 1320, dur: 0.18, gain: 0.15 });
      }
      ov.setLogo(logoAlpha, logoScale, logoY, glow);
      ov.setPress(press);
      return false;
    },
  };
}

function introSeq(st, ov) {
  const gf = st.greatFox, hangar = st.hangar, aw = st.arwings;
  const A_END = 3.3, B_END = 6.4, C_END = 9.6;
  const gfTrack = [{ t: 0, v: [-230, 40, -420] }, { t: A_END, v: [90, -14, 70], ease: Ease.linear }];
  let shot = -1;
  const launchT = [0.6, 1.15, 1.7, 2.25]; // per ship launch time inside shot B
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
    },
    update(t, dt) {
      const local = (a, b) => (t - a) / (b - a);
      if (t < A_END) {
        // ---- Shot A: Great Fox fly-by, camera pans to follow
        if (shot !== 0) { shot = 0; gf.visible = true; hangar.visible = false; aw.forEach((a) => (a.visible = false)); st.cut(); }
        evalTrack(gfTrack, t, gf.position);
        gf.rotation.set(-0.03, Math.atan2(320, -490) + Math.PI, -0.06); gf.userData.setPower(1.4);
        const look = tmpB.copy(gf.position).add(tmpC.set(0, -2, 20));
        const fov = evalScalar([{ t: 0, v: 40 }, { t: A_END, v: 60, ease: Ease.inOutSine }], t);
        st.cam(tmpA.set(0, 6, 0), look, fov, { lambda: 4.5, roll: -0.03 + t * 0.012, shake: 0.6 });
        st.focusShadow(gf, 70);
        ov.setFade(1 - seg(t, 0, 0.8, Ease.outCubic) + seg(t, A_END - 0.25, A_END, Ease.inQuad));
        st.exposure = 1.0;
      } else if (t < B_END) {
        // ---- Shot B: hangar bay, Arwings launch with anticipation
        const u = t - A_END;
        if (shot !== 1) {
          shot = 1; gf.visible = false; hangar.visible = true; aw.forEach((a) => { a.visible = true; a.scale.setScalar(1); }); st.cut();
        }
        const slots = [[-7, -3.6, 14], [7, -3.6, 14], [-7, -3.6, 26], [7, -3.6, 26]];
        aw.forEach((a, i) => {
          const s = slots[i], lt = launchT[i], k = u - lt;
          let z = s[2], y = s[1], power = 0.25, pitch = 0;
          if (k > -0.35 && k < 0) { const q = 1 + k / 0.35; z += Ease.inOutSine(q) * 0.9; y -= 0.15 * Math.sin(q * Math.PI); power = 0.25 + q * 1.2; pitch = -0.05 * q; } // anticipation: squat & creep back
          else if (k >= 0) { const q = k; z = s[2] - 300 * Ease.inCubic(clamp01(q / 1.4)) - Math.max(0, q - 1.4) * 320; y += Ease.outQuad(clamp01(q / 0.5)) * 2.0; power = 2.2; pitch = 0.08 * (1 - clamp01(q / 0.6)); }
          tmpA.set(s[0], y, z); hangar.localToWorld(tmpA); a.position.copy(tmpA);
          a.quaternion.copy(hangarQ); a.rotateX(pitch); a.rotateZ(Math.sin(u * 2 + i) * 0.01);
          a.userData.setPower(power);
        });
        // camera: low behind, slow push toward bay; small kick on each launch
        let kick = 0; launchT.forEach((lt) => { const k = u - lt; if (k > 0 && k < 0.4) kick += Math.sin(k / 0.4 * Math.PI) * 0.5; });
        const pos = tmpA.set(0 + Math.sin(u * 0.4) * 0.5, -2.4 + seg(u, 0, 3.1, Ease.inOutSine) * 1.2, 40 - seg(u, 0, 3.1, Ease.inOutSine) * 10);
        const look = tmpB.set(0, -1.2 - kick * 0.4, -60);
        hangar.localToWorld(pos); hangar.localToWorld(look);
        st.cam(pos, look, 52 + kick * 3, { lambda: 3.5, roll: kick * 0.02, shake: 0.8 + kick * 3 });
        st.focusShadow(aw[2], 20);
        ov.setFlash(kick * 0.1);
        ov.setFade(1 - seg(u, 0, 0.5, Ease.outCubic) + seg(u, 3.1 - 0.2, 3.1, Ease.inQuad));
        st.exposure = 1.05;
      } else {
        // ---- Shot C: exterior — Arwings pour out of the bay, peel into formation; level-start pan + caption
        const u = t - B_END;
        if (shot !== 2) { shot = 2; hangar.visible = false; gf.visible = true; gf.position.set(0, 0, 0); gf.quaternion.copy(hangarQ); gf.userData.setPower(1.2); st.cut(); }
        const fwd = tmpE.set(0, 0, -1).applyQuaternion(hangarQ);
        const right = tmpF.set(1, 0, 0).applyQuaternion(hangarQ);
        aw.forEach((a, i) => {
          a.visible = true;
          const k = u + 0.3 - i * 0.28;
          const dist = 36 + Math.max(0, k) * 85;
          const spread = smoothstep(0.2, 1.6, k) * (i % 2 ? 1 : -1) * (7 + Math.floor(i / 2) * 7) * 1.2;
          const rise = smoothstep(0.2, 1.8, k) * (-6 + Math.floor(i / 2) * 9);
          a.position.copy(gf.position).addScaledVector(fwd, dist).addScaledVector(right, spread).add(tmpA.set(0, -0.5 + rise, 0));
          const dir = tmpB.copy(fwd).addScaledVector(right, smoothstep(0.2, 1.2, k) * (1 - smoothstep(1.2, 2.2, k)) * (i % 2 ? 0.25 : -0.25));
          aim(a, dir, (i % 2 ? -1 : 1) * Math.sin(clamp01(k / 2.2) * Math.PI) * 0.9);
          a.userData.setPower(2.2);
        });
        // crane: starts low-front looking back at bay, swings wide to follow squadron toward planet
        const camK = seg(u, 0, 3.2, Ease.inOutSine);
        const pos = tmpA.copy(gf.position).addScaledVector(fwd, 70 + camK * 40).addScaledVector(right, -26 + camK * 46).add(tmpB.set(0, -16 + camK * 10, 0));
        const look = tmpB.copy(gf.position).addScaledVector(fwd, 30 + camK * 140).add(tmpC.set(0, -3 + camK * 3, 0));
        st.cam(pos, look, 46 - camK * 8, { lambda: 3.0, roll: -0.05 + camK * 0.08, shake: 0.5 });
        st.focusShadow(aw[0], 30);
        ov.setFade(1 - seg(u, 0, 0.5, Ease.outCubic) + seg(u, C_END - B_END - 0.5, C_END - B_END, Ease.inQuad));
        const cap = seg(u, 1.0, 1.7, Ease.outCubic);
        ov.setCaption(cap * (1 - seg(u, 2.75, 3.1)), 1 - Ease.outBack(cap), seg(u, 1.3, 2.2, Ease.outQuart));
        st.exposure = 1.0;
      }
      return t >= C_END;
    },
  };
}

function completeSeq(st, ov, stats) {
  const aw = st.arwings, DUR = 6.2;
  const s = { score: 12480, hits: 64, accuracy: 0.87, bonus: 5000, ...stats };
  const rows = [
    { label: 'ENEMIES DOWNED', value: s.hits, format: (v) => `${v}` },
    { label: 'ACCURACY', value: Math.round(s.accuracy * 100), format: (v) => `${v}%` },
    { label: 'WING BONUS', value: s.bonus, format: (v) => v.toLocaleString('en-US') },
    { label: 'TOTAL', value: s.score, format: (v) => v.toLocaleString('en-US'), total: true },
  ];
  return {
    name: 'complete', dur: DUR,
    start() {
      st.hideAll(); ov.letterbox(true, 0.9); ov.setFade(1); ov.setCaption(0);
      ov.buildTally(rows); ov.setTally(0); ov.setBig(0, 1.4);
      aw.forEach((a) => { a.visible = true; a.scale.setScalar(1); });
      st.exposure = 1.0;
    },
    update(t, dt) {
      // squadron flies away from camera toward the planet; lead does a victory barrel roll then boosts off
      const dir = tmpE.copy(PLANET_POS).normalize();
      const right = tmpF.crossVectors(dir, tmpA.set(0, 1, 0)).normalize();
      const up = tmpD.crossVectors(right, dir).normalize();
      const offs = [[0, 0], [-1, -0.4], [1, -0.4], [0, -1.0]];
      aw.forEach((a, i) => {
        const boostK = seg(t, 2.4 + i * 0.15, 4.6 + i * 0.15, Ease.inCubic);
        const d = 18 + t * 6 + boostK * 420;
        const wob = Math.sin(t * 1.3 + i) * 0.4;
        a.position.copy(dir).multiplyScalar(d).addScaledVector(right, (offs[i][0] * 7) * (1 + boostK * 0.6)).addScaledVector(up, offs[i][1] * 4 + wob + (i === 0 ? Math.sin(seg(t, 0.8, 2.2, Ease.linear) * Math.PI) * 2.5 : 0));
        const bank = i === 0 ? -seg(t, 0.8, 2.2, Ease.inOutSine) * Math.PI * 2 : Math.sin(t * 1.1 + i) * 0.08;
        aim(a, dir, bank + (i === 0 ? 0 : 0));
        a.userData.setPower(1 + boostK * 1.6);
      });
      // camera: trails, then gently pulls back and lets them go
      const pull = seg(t, 2.2, 5.5, Ease.inOutSine);
      const pos = tmpA.copy(dir).multiplyScalar(-2 - pull * 6).addScaledVector(right, 4 - pull * 3).addScaledVector(up, 2.2 + pull * 1.5);
      const look = tmpB.copy(dir).multiplyScalar(30 + pull * 60).addScaledVector(up, -1);
      st.cam(pos, look, 48 - pull * 6, { lambda: 3.5, roll: 0.04 - pull * 0.03, shake: 0.4 });
      st.focusShadow(aw[0], 16);
      st.bloomBoost = seg(t, 2.6, 4.2, Ease.outQuad) * 0.25;
      // UI
      ov.setFade(1 - seg(t, 0, 0.7, Ease.outCubic) + seg(t, DUR - 0.5, DUR, Ease.inQuad));
      const bigIn = seg(t, 0.55, 1.15, Ease.outBack);
      ov.setBig(seg(t, 0.55, 0.8), lerp(1.5, 1.0, bigIn) * (1 + Math.sin(t * 2) * 0.004));
      ov.setTally(seg(t, 1.1, 1.5));
      ov.tickTally(seg(t, 1.3, 4.6, Ease.linear));
      if (t > 4.6 && t < 4.7 && !this._dinged) { this._dinged = true; st.ctx.audio.tone({ type: 'triangle', f0: 660, f1: 990, dur: 0.35, gain: 0.15 }); }
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
    this.tally = 0;
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

export function playTitle(ctx, opts) { return getDirector(ctx).run(titleSeq(director.stage, director.overlay, opts)); }
export function playIntro(ctx) { return getDirector(ctx).run(introSeq(director.stage, director.overlay)); }
export function playComplete(ctx, stats) { return getDirector(ctx).run(completeSeq(director.stage, director.overlay, stats)); }

export async function create(ctx) {
  director = new Director(ctx);
  const d = director;
  // showcase: title -> intro -> complete -> loop. Chained synchronously so the
  // headless fixed-step harness never sees an idle frame between sequences.
  const show = ['title', 'intro', 'complete'];
  let idx = 0;
  const startNext = () => {
    const which = show[idx % show.length]; idx++;
    const seq = which === 'title' ? titleSeq(d.stage, d.overlay, { auto: true }) : which === 'intro' ? introSeq(d.stage, d.overlay) : completeSeq(d.stage, d.overlay, { score: 12480, hits: 64, accuracy: 0.87, bonus: 5000 });
    d.queue.push({ seq, resolve: null }); if (!d.seq) d._next();
  };
  d.onSeqEnd = () => { if (!d.seq) startNext(); };
  startNext();

  // autoplay script: press start on the title, otherwise hands off
  ctx.input.script = (t) => ({ x: 0, y: 0, buttons: t > 3.4 && t < 3.6 ? ['confirm'] : [] });

  return {
    update(dt, t) { d.update(dt, t); },
    dispose() { d.dispose(); if (director === d) director = null; },
  };
}
