// PIECE: onfoot — third-person action-adventure in the Great Fox hangar.
// Pilot on foot: run / jump / roll / blaster, orbit camera with lag, pickups, door.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildPilot } from './pilot.js';
import { buildHangarSteps, HANGAR } from './hangar.js';
import { makeFx } from './fx.js';
import { makeHud } from './hud.js';
import { makeGradePass } from '../lookdev/grade.js';

export { buildPilot } from './pilot.js';
export { buildDockedArwing } from './arwing.js';
export { makeGodRay } from './hangar.js';

const RUN_SPEED = 7.4, ACCEL = 34, JUMP_V = 7.2, GRAV = -20, ROLL_TIME = 0.55, ROLL_SPEED = 10.5, FIRE_RATE = 0.11;
const PLAYER_R = 0.42;

/**
 * Synchronous entry point (standalone piece / non-warm campaign path): drain the
 * incremental build in one go.
 */
export async function create(ctx) {
  const g = createSteps(ctx);
  let r; do { r = g.next(); } while (!r.done);
  return r.value;
}

/**
 * Incremental create: `yield` marks a point the campaign may return to the frame
 * loop. The hangar (procedural canvas textures + merged geometry + the docked
 * Arwing) is ~730 ms of construction on its own, which is why it is itself a
 * generator we delegate to — the whole stage build used to land on the single
 * frame that mounted it.
 */
export function* createSteps(ctx) {
  const { scene, camera, renderer, bloom, input, ui, composer } = ctx;

  // ---- render setup (restored on dispose)
  const prev = { bloomStrength: bloom.strength, bloomRadius: bloom.radius, bloomThreshold: bloom.threshold, exposure: renderer.toneMappingExposure, fov: camera.fov, shadowAuto: renderer.shadowMap.autoUpdate };
  // Shadow pass at half rate: one spot shadow map covers ~300 casters; updating it on
  // alternate frames halves the shadow draw calls while the follow-light lag stays sub-pixel.
  renderer.shadowMap.autoUpdate = false;
  let shadowTick = 0;
  // Bloom is a tight, high-threshold accent: only genuinely hot pixels (lamp faces, bolt
  // cores, ring filaments) glow, and only a little — the character must never disappear.
  bloom.strength = 0.38; bloom.radius = 0.32; bloom.threshold = 0.92;
  renderer.toneMappingExposure = 0.94;
  camera.fov = 54; camera.near = 0.1; camera.far = 1200; camera.updateProjectionMatrix();
  yield 'look';
  // RoomEnvironment PMREM bake: ~40ms of GPU+CPU on its own, so it gets its own unit
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env; scene.environmentIntensity = 0.5;
  pmrem.dispose();
  // colour grade (shared lookdev pass): cool lifted shadows, warm highlights, soft vignette
  let grade = composer.passes.find((p) => p.isLookGrade);
  const ownGrade = !grade;
  if (!grade) { grade = makeGradePass(); composer.addPass(grade); }
  grade.enabled = true;
  grade.uniforms.uContrast.value = 1.12; grade.uniforms.uSaturation.value = 1.16; grade.uniforms.uGamma.value = 1.0;
  grade.uniforms.uLift.value.setRGB(0.008, 0.016, 0.04); grade.uniforms.uGain.value.setRGB(1.06, 1.0, 0.93);
  grade.uniforms.uVignette.value = 0.42; grade.uniforms.uGrain.value = 0.014;

  yield 'setup';

  // ---- world
  const hangar = yield* buildHangarSteps(ctx);
  const fx = makeFx(scene);
  const opts = ctx.onfoot ?? ctx.opts?.onfoot ?? {};
  const hud = makeHud(ui, { title: opts.hudTitle !== false && !ctx.embedded });
  yield 'fx';
  // completion promise for the integrator (also emitted on ctx.events as 'onfoot:complete')
  let resolveComplete; const onComplete = new Promise((r) => { resolveComplete = r; });
  const pilot = buildPilot();
  scene.add(pilot.root);
  yield 'pilot';

  // pickups along the demo route + drones
  for (const [x, y, z] of [[2, 1.0, 16], [0.2, 1.0, 12], [-1.4, 2.4, 8], [1.0, 1.0, -6], [-1.0, 1.0, -12], [0.5, 1.0, -20], [2.5, 1.0, -23]]) fx.addPickup(x, y, z);
  for (const [x, y, z] of [[-3, 2.2, -8], [2.6, 1.8, -11], [0.2, 2.8, -15]]) fx.addDrone(x, y, z);
  hud.setRings(0, fx.pickups.length);

  // ---- player state
  const P = {
    pos: new THREE.Vector3(1.5, 0, 23), vel: new THREE.Vector3(), yaw: 0, // forward = (-sin yaw, -cos yaw) → yaw 0 faces -z (down the hangar)
    onGround: true, rolling: false, rollT: 0, rollDir: new THREE.Vector3(0, 0, -1), fireCd: 0, aiming: 0, landed: false, accel: 0, turn: 0, speedN: 0,
  };
  const cam = { yaw: 0, pitch: 0.2, dist: 5.6, pos: new THREE.Vector3(), look: new THREE.Vector3(), initialized: false };
  const { hx, hz } = HANGAR;

  const V = { move: new THREE.Vector3(), tmp: new THREE.Vector3(), tmp2: new THREE.Vector3(), muzzle: new THREE.Vector3(), dir: new THREE.Vector3() };

  // ---- autoplay script (drives the demo)
  // Waypoint-driven so the route is robust to camera lag: each beat = [until, waypoint|null, buttons(T)]
  const ROUTE = [
    [0.8, null], // idle beat
    [3.3, [0.5, 12], (T) => (T > 2.2 && T < 2.4 ? ['jump'] : [])],
    [4.7, null, () => ['fire']], // stand and shoot the drones ahead
    [6.6, [-1.2, -3], (T) => (T > 5.5 && T < 5.65 ? ['rollL'] : T > 6.3 && T < 6.45 ? ['jump'] : [])],
    [8.2, [0.8, -14], (T) => (T > 7.4 && T < 7.9 ? ['fire'] : [])],
    [12.6, [0, -28.3], () => ['interact']], // walk to the door, keep interact held until it opens
    [17.0, [0, -40], () => ['interact']], // through the door into the corridor
    [18.4, null, () => ['fire']],
    [21.0, [0, -24], (T) => (T > 19.2 && T < 19.35 ? ['rollR'] : [])],
    [24.5, [1.5, 20], (T) => (T > 22 && T < 22.2 ? ['jump'] : [])],
    [26, null],
  ];
  input.script = (t) => {
    const T = t % 26; // loop so long recordings keep moving
    const beat = ROUTE.find((r) => T < r[0]) ?? ROUTE[ROUTE.length - 1];
    let x = 0, y = 0;
    if (beat[1]) {
      const dx = beat[1][0] - P.pos.x, dz = beat[1][1] - P.pos.z; const d = Math.hypot(dx, dz);
      if (d > 0.6) {
        const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
        const k = Math.min(1, d / 1.5) / d;
        y = (dx * fx + dz * fz) * k; x = (dx * rx + dz * rz) * k;
      }
    }
    return { x, y, buttons: beat[2] ? beat[2](T) : [] };
  };

  // ---- helpers
  function resolveColliders(colliders) {
    for (const c of colliders) {
      if (P.pos.y + 1.7 < c.min.y || P.pos.y > c.max.y - 0.05) continue;
      const cx = Math.max(c.min.x, Math.min(P.pos.x, c.max.x)), cz = Math.max(c.min.z, Math.min(P.pos.z, c.max.z));
      const dx = P.pos.x - cx, dz = P.pos.z - cz; const d2 = dx * dx + dz * dz;
      if (d2 < PLAYER_R * PLAYER_R) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2); P.pos.x += dx / d * (PLAYER_R - d); P.pos.z += dz / d * (PLAYER_R - d); }
        else { // inside: push out along min axis
          const px = Math.min(P.pos.x - c.min.x, c.max.x - P.pos.x), pz = Math.min(P.pos.z - c.min.z, c.max.z - P.pos.z);
          if (px < pz) P.pos.x += (P.pos.x - c.min.x < c.max.x - P.pos.x ? -1 : 1) * (px + PLAYER_R); else P.pos.z += (P.pos.z - c.min.z < c.max.z - P.pos.z ? -1 : 1) * (pz + PLAYER_R);
        }
      }
    }
    // hangar bounds (corridor allowed through door gap)
    P.pos.z = Math.min(hz - 0.8, P.pos.z);
    if (P.pos.z < -hz + 0.8) {
      if (Math.abs(P.pos.x) < 2.5) { P.pos.x = Math.max(-2.5, Math.min(2.5, P.pos.x)); P.pos.z = Math.max(-hz - 14.5, P.pos.z); }
      else P.pos.z = -hz + 0.8;
    } else P.pos.x = Math.max(-hx + 0.8, Math.min(hx - 0.8, P.pos.x));
  }

  let lastMoveMag = 0, doorOpened = false, completed = false, doorT = 0;
  const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

  function update(dt, t) {
    dt = Math.min(dt, 1 / 30);
    renderer.shadowMap.needsUpdate = (shadowTick++ & 1) === 0;
    hangar.update(dt, t);

    // --- input → desired move in camera space
    const ax = input.axes.x, ay = input.axes.y;
    const fwdX = -Math.sin(cam.yaw), fwdZ = -Math.cos(cam.yaw);
    V.move.set(fwdX * ay + (-fwdZ) * ax, 0, fwdZ * ay + fwdX * ax);
    const mag = Math.min(1, V.move.length());
    if (mag > 0.01) V.move.normalize();
    const firing = input.isHeld('fire') && !P.rolling;
    P.aiming = firing ? 1 : Math.max(0, P.aiming - dt * 3);

    // roll start
    if ((input.wasPressed('rollL') || input.wasPressed('rollR')) && !P.rolling && P.onGround) {
      P.rolling = true; P.rollT = 0;
      P.rollDir.set(mag > 0.1 ? V.move.x : -Math.sin(P.yaw), 0, mag > 0.1 ? V.move.z : -Math.cos(P.yaw)).normalize();
      fx.dustPuff(P.pos, 8);
      if (!(ctx.sfx && ctx.sfx('roll'))) ctx.audio?.noise({ dur: 0.35, gain: 0.2, cutoff: 1400 });
    }

    // --- horizontal velocity
    let targetSpeed = RUN_SPEED * mag * (firing ? 0.45 : 1);
    if (P.rolling) {
      P.rollT += dt / ROLL_TIME;
      const k = 1 - P.rollT; const s = ROLL_SPEED * (0.4 + 0.6 * k * k);
      P.vel.x = P.rollDir.x * s; P.vel.z = P.rollDir.z * s;
      if (P.rollT >= 1) { P.rolling = false; P.rollT = 0; }
    } else {
      const tx = V.move.x * targetSpeed, tz = V.move.z * targetSpeed;
      const a = P.onGround ? ACCEL : ACCEL * 0.35;
      const dvx = tx - P.vel.x, dvz = tz - P.vel.z; const dl = Math.hypot(dvx, dvz); const step = Math.min(dl, a * dt);
      if (dl > 1e-4) { P.vel.x += dvx / dl * step; P.vel.z += dvz / dl * step; }
    }
    const hspeed = Math.hypot(P.vel.x, P.vel.z);
    P.accel = THREE.MathUtils.lerp(P.accel, (mag - lastMoveMag) / Math.max(dt, 1e-3) * 0.05, 0.2); lastMoveMag = mag;

    // --- facing
    let desiredYaw = P.yaw;
    if (firing) desiredYaw = cam.yaw; // face camera forward when shooting
    else if (hspeed > 0.4) desiredYaw = Math.atan2(-P.vel.x, -P.vel.z);
    const dy = angDiff(P.yaw, desiredYaw);
    const turnRate = firing ? 14 : 11;
    const stepY = Math.sign(dy) * Math.min(Math.abs(dy), turnRate * dt * (0.4 + Math.abs(dy)));
    P.yaw += stepY;
    P.turn = THREE.MathUtils.lerp(P.turn, THREE.MathUtils.clamp(stepY / Math.max(dt, 1e-3) / 6, -1, 1), 0.25);

    // --- jump / gravity
    P.landed = false;
    if (input.wasPressed('jump') && P.onGround && !P.rolling) { P.vel.y = JUMP_V; P.onGround = false; fx.dustPuff(P.pos, 8); if (!(ctx.sfx && ctx.sfx('jump'))) ctx.audio?.tone({ type: 'triangle', f0: 320, f1: 640, dur: 0.16, gain: 0.12 }); }
    P.vel.y += GRAV * dt;
    P.pos.addScaledVector(P.vel, dt);
    if (P.pos.y <= 0) { if (!P.onGround) { P.landed = true; fx.dustPuff(P.pos, 12); if (!(ctx.sfx && ctx.sfx('land'))) ctx.audio?.noise({ dur: 0.12, gain: 0.16, cutoff: 500 }); } P.pos.y = 0; P.vel.y = 0; P.onGround = true; }
    resolveColliders(hangar.colliders);

    // --- blaster
    P.fireCd -= dt;
    if (firing && P.fireCd <= 0) {
      P.fireCd = FIRE_RATE;
      pilot.muzzle.getWorldPosition(V.muzzle);
      V.dir.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
      // aim assist toward nearest live drone within a cone
      let best = null, bestD = 0.86;
      for (const d of fx.drones) { if (!d.alive) continue; V.tmp.copy(d.g.position).sub(V.muzzle); const dist = V.tmp.length(); V.tmp.divideScalar(dist); const dot = V.tmp.dot(V.dir); if (dot > bestD && dist < 30) { bestD = dot; best = V.tmp.clone(); } }
      if (best) V.dir.copy(best); else V.dir.y = 0.02;
      fx.fireBolt(V.muzzle, V.dir); pilot.fire();
      // blaster is ~9 shots/s — bank every other shot so the layered 'laser'
      // def doesn't stack 60+ scheduled notes a second
      P.sfxAlt = !P.sfxAlt;
      if (P.sfxAlt) { if (!(ctx.sfx && ctx.sfx('laser'))) ctx.audio?.tone({ type: 'square', f0: 1500, f1: 480, dur: 0.08, gain: 0.09 }); }
    }

    // --- door interaction
    const doorPos = V.tmp.set(0, 0, -hz + 0.5); const dDoor = P.pos.distanceTo(doorPos);
    const canInteract = dDoor < 6.5 && !doorOpened;
    hud.setPrompt(canInteract ? 'OPEN BLAST DOOR' : '');
    if (canInteract && (input.isHeld('interact') || input.wasPressed('confirm'))) {
      doorOpened = true; hangar.door.target = 1; hud.flash('DOOR UNLOCKED — PROCEED TO BRIDGE'); fx.sparks(new THREE.Vector3(0, 5, -hz + 1), 20, 0x40ff80);
      if (!(ctx.sfx && ctx.sfx('door'))) { ctx.audio?.noise({ dur: 0.9, gain: 0.3, cutoff: 350 }); ctx.audio?.tone({ type: 'sawtooth', f0: 60, f1: 40, dur: 0.9, gain: 0.15 }); }
      ctx.events?.emit?.('onfoot:door', { rings: fx.stats.rings, ringsTotal: fx.pickups.length });
    }
    if (doorOpened && !completed) { doorT += dt; if (doorT > 2.5 || P.pos.z < -hz) { completed = true; const s = { rings: fx.stats.rings, ringsTotal: fx.pickups.length, drones: fx.stats.drones }; ctx.sfx?.('victory'); ctx.events?.emit?.('onfoot:complete', s); resolveComplete(s); } }

    // --- FX / pickups
    fx.update(dt, t, P.pos, hangar.colliders, (kind) => {
      if (kind === 'ring') { hud.setRings(fx.stats.rings, fx.pickups.length); if (!(ctx.sfx && ctx.sfx('ring'))) ctx.audio?.tone({ type: 'triangle', f0: 1320, f1: 1980, dur: 0.14, gain: 0.14 }); ctx.events?.emit?.('onfoot:ring', { rings: fx.stats.rings, ringsTotal: fx.pickups.length }); }
      if (kind === 'drone') { hud.setDrones(fx.stats.drones); if (!(ctx.sfx && ctx.sfx('explosionS'))) ctx.audio?.noise({ dur: 0.5, gain: 0.25, cutoff: 700 }); ctx.events?.emit?.('onfoot:drone', { drones: fx.stats.drones }); }
    });

    // --- pilot pose
    pilot.root.position.copy(P.pos);
    // the pilot model faces +Z (muzzle/visor forward, tail/backpack on -Z) while the
    // controller's yaw convention is forward = (-sin yaw, -cos yaw) = -Z — so the
    // rig turns a half-turn past the heading or the pilot runs with his back leading.
    pilot.root.rotation.y = P.yaw + Math.PI;
    P.speedN = THREE.MathUtils.lerp(P.speedN, hspeed / RUN_SPEED, 1 - Math.exp(-dt * 12));
    pilot.animate(dt, { speed: P.speedN, airborne: !P.onGround, rolling: P.rolling, rollT: P.rollT, turn: P.turn, aiming: P.aiming > 0.2, landed: P.landed, accel: P.accel });

    // --- camera: orbit behind player with lag; clamp inside room
    const wantYaw = P.rolling ? cam.yaw : P.yaw;
    const yawErr = angDiff(cam.yaw, wantYaw);
    cam.yaw += yawErr * Math.min(1, dt * (firing ? 6 : 2.6) * (0.5 + Math.min(1, hspeed / RUN_SPEED)));
    // low, slightly-off-centre framing so the hangar (lamps, bay, Arwing) reads above the pilot
    const pitchT = firing ? 0.14 : 0.2 + (P.onGround ? 0 : -0.04) + P.speedN * 0.03;
    cam.pitch += (pitchT - cam.pitch) * Math.min(1, dt * 3);
    const distT = firing ? 3.2 : 4.6 + P.speedN * 0.8;
    cam.dist += (distT - cam.dist) * Math.min(1, dt * 3);
    const lookT = V.tmp2.set(P.pos.x, P.pos.y * 0.6 + 1.55 + P.speedN * 0.15, P.pos.z);
    // shoulder offset: pilot sits left of centre (camera-right vector)
    lookT.add(V.dir.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)).multiplyScalar(firing ? 0.9 : 0.55));
    if (firing) lookT.add(V.tmp.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)).multiplyScalar(2.4));
    const lagK = cam.initialized ? Math.min(1, dt * 7) : 1;
    cam.look.lerp(lookT, lagK);
    const cp = V.tmp.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(cam.dist).add(cam.look);
    // keep camera inside walls (collision-free)
    const inCorridor = cp.z < -hz + 0.3 && Math.abs(cp.x) < 2.4;
    if (!inCorridor) { cp.x = THREE.MathUtils.clamp(cp.x, -hx + 0.7, hx - 0.7); cp.z = THREE.MathUtils.clamp(cp.z, -hz + 0.7, hz - 0.7); }
    else cp.x = THREE.MathUtils.clamp(cp.x, -2.4, 2.4);
    cp.y = THREE.MathUtils.clamp(cp.y, 0.5, HANGAR.h - 0.6);
    // occlusion: march from the look point toward the camera and stop before any prop AABB
    {
      const N = 14, pad = 0.45; let k = 1;
      for (let i = 1; i <= N; i++) {
        const f = i / N; const px = cam.look.x + (cp.x - cam.look.x) * f, py = cam.look.y + (cp.y - cam.look.y) * f, pz = cam.look.z + (cp.z - cam.look.z) * f;
        let hit = false;
        for (const c of hangar.colliders) { if (px > c.min.x - pad && px < c.max.x + pad && py > c.min.y - pad && py < c.max.y + pad && pz > c.min.z - pad && pz < c.max.z + pad) { hit = true; break; } }
        if (hit) { k = Math.max(0.25, (i - 1) / N); break; }
      }
      if (k < 1) cp.lerpVectors(cam.look, cp, k);
    }
    cam.pos.lerp(cp, cam.initialized ? Math.min(1, dt * 6) : 1);
    cam.initialized = true;
    camera.position.copy(cam.pos);
    const sh = fx.shake;
    camera.position.x += (Math.random() - 0.5) * sh * 0.25; camera.position.y += (Math.random() - 0.5) * sh * 0.25;
    camera.lookAt(cam.look);
    camera.rotation.z += Math.sin(t * 40) * sh * 0.01;

    // key light follows player (shadow quality)
    hangar.key.position.set(P.pos.x + 3, HANGAR.h - 1.5, P.pos.z + 4);
    hangar.key.target.position.set(P.pos.x - 1, 0, P.pos.z - 2);

    hud.update(dt, t, { speed: hspeed / RUN_SPEED, firing, air: !P.onGround, rolling: P.rolling });
  }

  return {
    update,
    onComplete,
    get ringsCollected() { return fx.stats.rings; },
    get ringsTotal() { return fx.pickups.length; },
    get dronesDestroyed() { return fx.stats.drones; },
    get doorUnlocked() { return doorOpened; },
    get complete() { return completed; },
    get pos() { return P.pos; }, // integrator/harness introspection
    setHudVisible: (v) => hud.setVisible(v),
    setTitle: (a, b) => hud.setTitle(a, b),
    dispose() {
      renderer.shadowMap.autoUpdate = prev.shadowAuto; renderer.shadowMap.needsUpdate = true;
      hangar.dispose(); fx.dispose(); hud.dispose();
      scene.remove(pilot.root); pilot.root.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      scene.environment = null; env.dispose(); scene.background = null;
      bloom.strength = prev.bloomStrength; bloom.radius = prev.bloomRadius; bloom.threshold = prev.bloomThreshold; renderer.toneMappingExposure = prev.exposure;
      camera.fov = prev.fov; camera.updateProjectionMatrix();
      if (ownGrade) { composer.removePass(grade); grade.dispose?.(); } else grade.enabled = false;
      input.script = null;
    },
  };
}
