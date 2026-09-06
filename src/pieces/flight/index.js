// PIECE: flight — rail-flight feel. Corridor movement in a soft box, pitch/yaw
// with bank, barrel roll (Q/E or double-tap) with i-frames + sparkle, boost /
// brake with FOV kick, camera lag and speed lines, near+far reticle, lasers
// with recoil. Chase camera leads on turns (Star Fox 64 / Zero style).
import * as THREE from 'three';
import { buildFallbackArwing } from './arwing.js';
import { PALETTE, SUN_DIR, buildSky, buildGround, buildMesas, Monoliths, Gates } from './environment.js';
import { Lasers, SpeedLines, Sparkle, Reticle, makeGradePass } from './effects.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
const easeInOutBack = (t) => { // anticipation + overshoot
  const c1 = 1.2, c2 = c1 * 1.525;
  return t < 0.5
    ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
};

async function loadArwing() {
  try {
    const mod = await import('../ship/index.js');
    if (typeof mod.buildArwing === 'function') {
      const s = await mod.buildArwing();
      if (s && s.isObject3D) return s;
    }
  } catch (e) { /* ship piece not ready: fall back */ }
  return buildFallbackArwing();
}

export async function create(ctx) {
  const { scene, camera, renderer, composer, bloom, input, ui, rng } = ctx;

  // ---------- look ----------
  scene.background = null;
  scene.fog = new THREE.Fog(PALETTE.fog.clone(), 260, 1500);
  const sky = buildSky(); scene.add(sky);
  const ground = buildGround(); scene.add(ground);
  const mesas = buildMesas(rng); scene.add(mesas);

  const hemi = new THREE.HemisphereLight(0x7fb4ff, 0x3c6e66, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2bf, 3.2);
  sun.position.copy(SUN_DIR).multiplyScalar(200);
  scene.add(sun); scene.add(sun.target);
  const rim = new THREE.DirectionalLight(0x7fa8ff, 1.1); rim.position.set(60, 20, 120); scene.add(rim);

  // environment reflections from our own sky so paint shows real spec/fresnel
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); envScene.add(buildSky());
  const envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.8;
  pmrem.dispose();

  const savedBloom = { strength: bloom.strength, radius: bloom.radius, threshold: bloom.threshold };
  bloom.strength = 0.75; bloom.radius = 0.5; bloom.threshold = 0.82;
  const grade = makeGradePass();
  composer.insertPass(grade, composer.passes.length - 1);

  // ---------- ship ----------
  const shipRoot = new THREE.Group();       // position on the rail (x,y,z) - no rotation
  const shipAttitude = new THREE.Group();   // pitch/yaw/bank
  const shipRoll = new THREE.Group();       // barrel roll spin
  const arwing = await loadArwing();
  {
    // normalise scale so the ship is ~6 units long regardless of which model we got
    const bb = new THREE.Box3().setFromObject(arwing);
    const size = bb.getSize(new THREE.Vector3());
    const len = Math.max(size.z, 1e-3);
    arwing.scale.multiplyScalar(6 / len);
    const c = bb.getCenter(new THREE.Vector3()).multiplyScalar(6 / len);
    arwing.position.sub(c);
  }
  shipRoll.add(arwing); shipAttitude.add(shipRoll); shipRoot.add(shipAttitude); scene.add(shipRoot);
  const gdiffs = []; arwing.traverse((o) => { if (o.name === 'gdiff' || /diffuser|gdiff/i.test(o.name)) gdiffs.push(o); });
  const engineGlow = arwing.getObjectByName('engineGlow');
  // engine flame cone
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 4, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  flame.rotation.x = Math.PI / 2; flame.position.set(0, -0.05, 4.9); shipRoll.add(flame);
  const flameCore = flame.clone(); flameCore.material = flame.material.clone(); flameCore.material.color.set(0xffffff); flameCore.material.opacity = 0.9; flameCore.scale.set(0.45, 0.6, 0.45); shipRoll.add(flameCore);

  const sparkle = new Sparkle(shipAttitude, rng);
  const lasers = new Lasers(scene);
  scene.add(camera); // so camera-attached speed lines render
  const speedLines = new SpeedLines(camera, rng);
  const reticle = new Reticle(scene);
  const monoliths = new Monoliths(rng); scene.add(monoliths.mesh);
  const gates = new Gates(rng); scene.add(gates.group);

  // ---------- HUD (minimal: speed / boost gauge) ----------
  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;font-family:"Segoe UI",Inter,system-ui,sans-serif;color:#e9f6ff';
  hud.innerHTML = `
    <div style="position:absolute;left:36px;bottom:34px;">
      <div style="font:800 12px/1 sans-serif;letter-spacing:.32em;opacity:.8;text-shadow:0 0 10px rgba(120,200,255,.6)">BOOST</div>
      <div style="margin-top:6px;width:220px;height:10px;border:2px solid rgba(233,246,255,.75);border-radius:2px;transform:skewX(-14deg);overflow:hidden;background:rgba(10,20,40,.45)">
        <div id="fl-boost" style="height:100%;width:100%;background:linear-gradient(90deg,#4cd6ff,#a8f0ff);box-shadow:0 0 12px #6ce0ff"></div>
      </div>
    </div>
    <div style="position:absolute;right:36px;bottom:34px;text-align:right">
      <div style="font:800 12px/1 sans-serif;letter-spacing:.32em;opacity:.8">SPEED</div>
      <div id="fl-speed" style="font:900 30px/1 sans-serif;letter-spacing:.06em;margin-top:4px;text-shadow:0 0 14px rgba(120,200,255,.7);font-variant-numeric:tabular-nums">000</div>
    </div>
    <div id="fl-msg" style="position:absolute;left:50%;top:18%;transform:translateX(-50%);font:900 26px/1 sans-serif;letter-spacing:.3em;color:#fff;opacity:0;text-shadow:0 0 18px rgba(140,230,255,.9);transition:opacity .12s"></div>`;
  ui.appendChild(hud);
  const elBoost = hud.querySelector('#fl-boost'), elSpeed = hud.querySelector('#fl-speed'), elMsg = hud.querySelector('#fl-msg');
  let msgT = 0;
  const say = (s) => { elMsg.textContent = s; msgT = 1.1; };

  // ---------- state ----------
  const S = {
    x: 0, y: 12, z: 0,           // rail-relative position (z is travel)
    vx: 0, vy: 0,
    pitch: 0, yaw: 0, bank: 0,
    speed: 120, baseSpeed: 120,
    boost: 0, brake: 0, gauge: 1,
    roll: { active: false, t: 0, dir: 1, cool: 0 },
    tapL: -10, tapR: -10, prevX: 0,
    fireCool: 0, side: 1, recoil: 0,
    fov: 62, shake: 0, flash: 0,
    invuln: 0,
  };
  const BOX = { x: 26, yMin: 4, yMax: 30 };
  const camPos = new THREE.Vector3(0, 18, 26);
  const camLook = new THREE.Vector3(0, 12, -60);
  const tmp = new THREE.Vector3(), aimDir = new THREE.Vector3(0, 0, -1), shipWorld = new THREE.Vector3();
  camera.near = 0.5; camera.far = 5000; camera.fov = 62; camera.updateProjectionMatrix();

  // ---------- autoplay script ----------
  input.script = (t) => {
    const buttons = [];
    let x = Math.sin(t * 1.1) * 0.9 + Math.sin(t * 2.7) * 0.25;
    let y = Math.sin(t * 0.8 + 1.0) * 0.6;
    const m = t % 16;
    if (m > 2.0 && m < 4.6) buttons.push('boost');
    if (m > 6.0 && m < 7.4) buttons.push('brake');
    if ((m > 3.1 && m < 3.3) || (m > 9.4 && m < 9.6)) buttons.push('rollR');
    if (m > 12.2 && m < 12.4) buttons.push('rollL');
    if (Math.floor(t * 2) % 3 !== 2) buttons.push('fire');
    if (m > 10 && m < 12) { x = 1; y = -0.3; }
    if (m > 13.5 && m < 15) { x = -1; y = 0.6; buttons.push('boost'); }
    return { x, y, buttons };
  };

  let time = 0;
  function update(dt, t) {
    dt = Math.min(dt, 1 / 20);
    time += dt;
    const ax = input.axes.x, ay = input.axes.y;

    // --- boost / brake with gauge
    const wantBoost = input.isHeld('boost') && S.gauge > 0.02;
    const wantBrake = input.isHeld('brake') && S.gauge > 0.02;
    S.boost = damp(S.boost, wantBoost ? 1 : 0, wantBoost ? 6 : 3.5, dt);
    S.brake = damp(S.brake, wantBrake ? 1 : 0, wantBrake ? 7 : 4, dt);
    if (wantBoost || wantBrake) S.gauge = Math.max(0, S.gauge - dt * 0.45); else S.gauge = Math.min(1, S.gauge + dt * 0.25);
    if (input.wasPressed('boost') && S.gauge > 0.02) say('BOOST');
    if (input.wasPressed('brake') && S.gauge > 0.02) say('BRAKE');
    S.speed = S.baseSpeed * (1 + S.boost * 0.9 - S.brake * 0.55);

    // --- barrel roll: Q/E or double-tap the stick
    const R = S.roll;
    R.cool = Math.max(0, R.cool - dt);
    let rollReq = 0;
    if (input.wasPressed('rollL')) rollReq = -1;
    if (input.wasPressed('rollR')) rollReq = 1;
    if (ax > 0.6 && S.prevX <= 0.6) { if (time - S.tapR < 0.3) rollReq = 1; S.tapR = time; }
    if (ax < -0.6 && S.prevX >= -0.6) { if (time - S.tapL < 0.3) rollReq = -1; S.tapL = time; }
    S.prevX = ax;
    if (rollReq && !R.active && R.cool <= 0) { R.active = true; R.t = 0; R.dir = rollReq; S.invuln = 0.7; }
    if (R.active) {
      R.t += dt / 0.62;
      if (R.t >= 1) { R.active = false; R.t = 0; R.cool = 0.15; }
    }
    S.invuln = Math.max(0, S.invuln - dt);
    const rollAngle = R.active ? -R.dir * easeInOutBack(R.t) * Math.PI * 2 : 0;

    // --- steering in the soft box: acceleration + drag, soft walls
    const agil = 1 - S.boost * 0.25 + S.brake * 0.3;
    const targetVx = ax * 46 * agil, targetVy = ay * 34 * agil;
    S.vx = damp(S.vx, targetVx, 5.5, dt);
    S.vy = damp(S.vy, targetVy, 5.5, dt);
    S.x += S.vx * dt; S.y += S.vy * dt;
    // soft walls push back
    if (S.x > BOX.x) { S.x = damp(S.x, BOX.x, 12, dt); S.vx *= 0.6; }
    if (S.x < -BOX.x) { S.x = damp(S.x, -BOX.x, 12, dt); S.vx *= 0.6; }
    if (S.y > BOX.yMax) { S.y = damp(S.y, BOX.yMax, 12, dt); S.vy *= 0.6; }
    if (S.y < BOX.yMin) { S.y = damp(S.y, BOX.yMin, 12, dt); S.vy *= 0.6; }
    S.z -= S.speed * dt;

    // attitude: yaw/pitch toward velocity, bank into turns (with a little overshoot from input)
    S.yaw = damp(S.yaw, -S.vx * 0.012 - ax * 0.08, 8, dt);
    S.pitch = damp(S.pitch, S.vy * 0.014 + ay * 0.10, 8, dt);
    S.bank = damp(S.bank, -ax * 0.95 - S.vx * 0.006, 6, dt);
    S.recoil = Math.max(0, S.recoil - dt * 9);

    shipRoot.position.set(S.x, S.y, S.z);
    shipAttitude.rotation.set(S.pitch, S.yaw, S.bank, 'YXZ');
    shipRoll.rotation.z = rollAngle;
    shipRoll.position.z = S.recoil * 0.6 + S.brake * 1.2 - S.boost * 1.5;

    // --- aim + lasers
    shipRoot.getWorldPosition(shipWorld);
    aimDir.set(0, 0, -1).applyEuler(shipAttitude.rotation).normalize();
    S.fireCool -= dt;
    let fired = false;
    if (input.isHeld('fire') && S.fireCool <= 0) {
      S.fireCool = 0.13;
      S.side = -S.side;
      const muzzle = new THREE.Vector3(S.side * 2.1, -0.45, -1.5).applyMatrix4(shipRoll.matrixWorld);
      const target = shipWorld.clone().addScaledVector(aimDir, 110);
      lasers.fire(muzzle, target.sub(muzzle).normalize());
      S.recoil = 1; S.shake = Math.max(S.shake, 0.25);
      fired = true;
    }
    lasers.update(dt);

    // --- world
    if (gates.update(S, dt)) { say('NICE!'); S.flash = 0.35; S.gauge = Math.min(1, S.gauge + 0.3); }
    monoliths.update(S.z);
    ground.position.set(0, 0, S.z);
    ground.material.uniforms.camPos.value.copy(camera.position);
    ground.material.uniforms.shipPos.value.copy(shipWorld);
    sky.position.set(S.x * 0.2, 0, S.z);
    sky.material.uniforms.time.value = time;
    mesas.position.z = S.z;
    sun.target.position.set(S.x, S.y, S.z);

    // --- ship glow / flame reacts to throttle
    const thr = 1 + S.boost * 1.6 - S.brake * 0.6;
    for (const g of gdiffs) if (g.material?.emissiveIntensity !== undefined) g.material.emissiveIntensity = 3.0 * thr + Math.sin(time * 30) * 0.3;
    flame.scale.set(1 * thr * 0.9, 1 + S.boost * 1.8 - S.brake * 0.5 + Math.sin(time * 40) * 0.06, 1 * thr * 0.9);
    flame.material.opacity = 0.45 + S.boost * 0.4;
    flameCore.scale.set(0.45 * thr, 0.6 + S.boost * 1.5, 0.45 * thr);
    if (engineGlow) engineGlow.scale.setScalar(1 + S.boost * 0.5);

    sparkle.update(dt, R.active, R.t);

    // --- camera: chase, lags laterally, leads look-at into the turn, FOV kick
    const lagX = 0.55, lagY = 0.55;
    const desired = tmp.set(S.x * lagX, 9 + S.y * lagY + 3 * S.brake, S.z + 24 + S.brake * 5 - S.boost * 4);
    camPos.x = damp(camPos.x, desired.x, 6, dt);
    camPos.y = damp(camPos.y, desired.y, 6, dt);
    camPos.z = damp(camPos.z, desired.z, 9, dt);
    const lead = new THREE.Vector3(S.x + S.vx * 0.5 + ax * 6, S.y + S.vy * 0.4 + ay * 3, S.z - 70);
    camLook.x = damp(camLook.x, lead.x, 7, dt);
    camLook.y = damp(camLook.y, lead.y, 7, dt);
    camLook.z = lead.z;
    S.shake = Math.max(0, S.shake - dt * 3);
    const shk = S.shake * 0.12 + S.boost * 0.08;
    camera.position.set(camPos.x + Math.sin(time * 61) * shk, camPos.y + Math.cos(time * 47) * shk, camPos.z);
    camera.up.set(Math.sin(S.bank * 0.12), 1, 0).normalize();
    camera.lookAt(camLook);
    camera.rotation.z += S.bank * 0.10; // camera rolls a touch with the ship
    S.fov = damp(S.fov, 62 + S.boost * 16 - S.brake * 9, 5, dt);
    if (Math.abs(camera.fov - S.fov) > 0.01) { camera.fov = S.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();

    // --- post & fx
    speedLines.update(dt, clamp(S.boost * 1.0 + Math.max(0, (S.speed - 120) / 120), 0, 1), S.speed);
    S.flash = Math.max(0, S.flash - dt * 2);
    grade.uniforms.boost.value = S.boost;
    grade.uniforms.flash.value = S.flash * 0.25 + (S.invuln > 0.55 ? 0.08 : 0);
    grade.uniforms.time.value = time;
    reticle.update(shipWorld, aimDir, camera, dt, fired);

    // --- HUD
    elBoost.style.width = `${(S.gauge * 100).toFixed(1)}%`;
    elBoost.style.background = S.gauge < 0.25 ? 'linear-gradient(90deg,#ff6a3c,#ffb56b)' : 'linear-gradient(90deg,#4cd6ff,#a8f0ff)';
    elSpeed.textContent = String(Math.round(S.speed * 3.1)).padStart(3, '0');
    msgT = Math.max(0, msgT - dt);
    elMsg.style.opacity = msgT > 0 ? String(clamp(msgT * 3, 0, 1)) : '0';
  }

  function dispose() {
    input.script = null;
    bloom.strength = savedBloom.strength; bloom.radius = savedBloom.radius; bloom.threshold = savedBloom.threshold;
    composer.removePass(grade); grade.dispose?.();
    scene.environment = null; envRT.dispose();
    scene.fog = null;
    reticle.dispose();
    camera.remove(speedLines.lines);
    camera.up.set(0, 1, 0); camera.fov = 60; camera.updateProjectionMatrix();
    hud.remove();
    scene.traverse((o) => { if (o.isMesh || o.isLine || o.isPoints) { o.geometry?.dispose?.(); if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose()); else o.material?.dispose?.(); } });
    scene.clear();
  }

  return { update, dispose };
}
