// PIECE: vfx — VFX library + timed showcase.
// The library lives in ./vfx.js (createVfx). This file is the demo scene: the
// Arwing on rails above Corneria, Venomian fighter waves and a 12 s scripted
// loop that fires everything: twin lasers, hit sparks, charge shot + lock-on,
// layered explosions, boost trails, smart bomb, hit-stop and screen shake.
import * as THREE from 'three';
import { createVfx, PALETTE } from './vfx.js';
import { applyLook, makePlanet, PRESETS } from '../lookdev/index.js';
import { buildArwing } from '../ship/arwing.js';
import { buildEnemyCraft, disposeCraft } from '../enemies/craft.js';

export { createVfx, PALETTE } from './vfx.js';

// Other builders edit the pieces we import concurrently; absorb their HMR
// updates here (a full page reload would abort a headless capture mid-run).
// The next reload/boot picks up their new code anyway.
if (import.meta.hot) import.meta.hot.accept(['../lookdev/index.js', '../ship/arwing.js', '../enemies/craft.js'], () => {});

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = V(), _b = V(), _c = V();

// Look: lookdev's "space" preset, but with the sun high to the upper-right so
// it rim-lights the Arwing and sits just outside the frame (glare spills in).
const LOOK = {
  ...PRESETS.space, name: 'vfx-orbit',
  sun: { ...PRESETS.space.sun, dir: [0.55, 0.62, -0.5], glow: 0.7, size: 0.03 },
  bloom: { strength: 0.5, radius: 0.5, threshold: 0.9 },
  grade: { ...PRESETS.space.grade, contrast: 1.08, saturation: 1.15, vignette: 0.38 },
};

function buildAsteroid(rng, r) {
  const geo = new THREE.IcosahedronGeometry(r, 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _a.fromBufferAttribute(p, i);
    const n = _a.clone().normalize();
    const d = 1 + 0.18 * Math.sin(n.x * 5.1 + 1.3) * Math.cos(n.y * 4.3) + 0.12 * Math.sin(n.z * 7.7 + n.x * 3.1) + 0.06 * Math.sin(n.y * 13 + n.z * 11);
    _a.multiplyScalar(d); p.setXYZ(i, _a.x, _a.y, _a.z);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a6f63, roughness: 0.9, metalness: 0.05, flatShading: true });
  return new THREE.Mesh(geo, mat);
}

export async function create(ctx) {
  const { scene, camera, renderer, ui, rng, input } = ctx;
  scene.background = null;
  // Headless capture (fixed step) must never be torn down by a Vite full-reload
  // (e.g. public/progress.json rewritten by tooling): park the reload forever.
  if (import.meta.hot && ctx.engine?.fixedStep) import.meta.hot.on('vite:beforeFullReload', () => new Promise(() => {}));

  // --- environment / lighting rig (shared lookdev rig: sky, sun, env, grade)
  const look = applyLook(ctx, LOOK, { shadowMap: 512, shadowSize: 8 });
  look.sun.castShadow = false; // nothing receives shadows in this demo
  const sunDir = look.preset.sun.dir.clone().normalize();
  const planet = makePlanet({ radius: 640, seed: 7, preset: look.preset });
  planet.position.set(-140, -800, -760); scene.add(planet);
  const planetBounce = new THREE.DirectionalLight(0x3f7cff, 0.7); planetBounce.position.set(-0.3, -1, -0.2); scene.add(planetBounce);

  // --- vfx library
  const vfx = createVfx(ctx, { hitTest: (b) => hitTest(b) });
  if (location.search.includes('novfx')) vfx.group.visible = false;
  vfx.setSun(sunDir);

  // Harness friendliness (same trick as lookdev): in fixed-step mode drain the
  // GL queue each frame so stepping N frames on software GL doesn't backlog.
  const gl = renderer.getContext();
  const syncGL = !!ctx.engine?.fixedStep;
  const syncPx = new Uint8Array(4);
  const drainGL = () => { renderer.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPx); };

  // --- player: the real Arwing from the ship piece
  const arwing = buildArwing();
  const ship = arwing.group; scene.add(ship);
  arwing.setHover(0);
  ship.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  const MUZZLES = [V(-1.7, -0.67, -1.9), V(1.7, -0.67, -1.9)];
  const NOZZLE = V(0, -0.02, 3.45);
  const shipPos = V(0, 0, 0), shipVel = V(); let bank = 0, pitch = 0;
  const trail = vfx.trail({ color: PALETTE.boost, hot: PALETTE.boostHot, width: 0.6, segments: 30, spacing: 0.035 });
  const wingTrailL = vfx.trail({ color: new THREE.Color(0.35, 0.8, 1.0), width: 0.14, segments: 22, spacing: 0.035 });
  const wingTrailR = vfx.trail({ color: new THREE.Color(0.35, 0.8, 1.0), width: 0.14, segments: 22, spacing: 0.035 });
  const fwd = V(0, 0, -1);

  // --- targets: Venomian fighters (enemies piece) + asteroids
  const KINDS = ['vulture', 'hornet', 'vulture', 'mantis'];
  const targets = [];
  const spawnDrone = (x, y, z, path, kind) => {
    const mesh = buildEnemyCraft(kind ?? KINDS[Math.floor(rng.next() * KINDS.length)]);
    mesh.position.set(x, y, z); scene.add(mesh);
    const t = { kind: 'drone', mesh, pos: mesh.position, radius: mesh.userData.radius * 0.8, hp: mesh.userData.hp, dead: false, age: 0, path,
      vel: V(0, 0, mesh.userData.kind === 'hornet' ? 46 : 36), fireT: 0.6 + rng.next(), flash: 0, punch: 0 };
    targets.push(t); return t;
  };
  const spawnAsteroid = (x, y, z, r) => {
    const mesh = buildAsteroid(rng, r); mesh.position.set(x, y, z);
    mesh.rotation.set(rng.next() * 6, rng.next() * 6, 0); scene.add(mesh);
    const t = { kind: 'rock', mesh, pos: mesh.position, radius: r * 1.05, hp: 4, dead: false, age: 0, spin: V(rng.range(-0.4, 0.4), rng.range(-0.4, 0.4), 0.1), vel: V(rng.range(-1, 1), rng.range(-1, 1), 22), flash: 0, punch: 0 };
    targets.push(t); return t;
  };
  const ROCK_TINT = new THREE.Color(0.3, 0.26, 0.22);
  const removeTarget = (t) => {
    scene.remove(t.mesh);
    if (t.kind === 'rock') { t.mesh.geometry.dispose(); t.mesh.material.dispose(); } else disposeCraft(t.mesh);
  };
  const killTarget = (t, size, opts) => {
    if (t.dead) return; t.dead = true;
    removeTarget(t);
    vfx.explode(t.pos, size, opts);
  };
  const hitTest = (b) => {
    for (const t of targets) {
      if (t.dead) continue;
      if (b.owner === 'enemy') continue;
      if (b.pos.distanceToSquared(t.pos) < (t.radius + 0.4) ** 2) {
        _a.copy(b.pos).sub(t.pos).normalize();
        _b.copy(t.pos).addScaledVector(_a, t.radius * 0.9);
        vfx.hitSparks(_b, _a, { color: b.color, scale: 1 });
        t.hp -= b.damage; t.flash = 1; t.punch = 1;
        if (t.hp <= 0) killTarget(t, t.kind === 'rock' ? 3.0 : 2.0, t.kind === 'rock' ? { debrisTint: ROCK_TINT } : {});
        return true;
      }
    }
    return false;
  };

  // --- scripted demo (looping 12 s)
  const PERIOD = 12;
  const burst = (t, from, to, period = 0.2, duty = 0.08) => t >= from && t < to && ((t - from) % period) < duty;
  input.script = (t) => {
    const u = t % PERIOD;
    const buttons = [];
    if (u < 2.3 || (u > 7.6 && u < 10.2)) buttons.push('boost');
    if (burst(u, 0.5, 2.4) || burst(u, 4.1, 5.7, 0.18) || burst(u, 8.6, 11.6, 0.17)) buttons.push('fire');
    if (u >= 2.5 && u < 3.7) buttons.push('fire');           // hold = charge shot
    if (u >= 5.5 && u < 5.65) buttons.push('bomb');
    if (u > 10.4 && u < 10.9) buttons.push('rollR');
    return { x: Math.sin(u * 0.9) * 0.8 + Math.sin(u * 2.3) * 0.25, y: Math.cos(u * 0.7 + 1) * 0.6, buttons };
  };

  // --- UI: caption + tag (vignette/grade come from the lookdev grade pass)
  const caption = document.createElement('div');
  caption.style.cssText = 'position:absolute;left:50%;bottom:9%;transform:translateX(-50%) skewX(-8deg);font:800 28px/1 "Segoe UI","Helvetica Neue",Arial,system-ui;letter-spacing:.34em;color:#eef6ff;text-shadow:0 0 22px rgba(90,170,255,.85),0 2px 0 rgba(0,0,0,.6);opacity:0;transition:opacity .18s,transform .18s';
  if (ctx.engine?.fixedStep) caption.style.transition = 'none'; // captures are not real-time
  const tag = document.createElement('div');
  tag.style.cssText = 'position:absolute;left:48px;top:40px;font:700 11px/1.4 "Segoe UI","Helvetica Neue",Arial,system-ui;letter-spacing:.42em;color:#fff;opacity:.7;text-shadow:0 2px 12px rgba(0,0,0,.6)';
  tag.innerHTML = 'STARWING &nbsp;·&nbsp; VFX LIBRARY';
  ui.append(caption, tag);
  const CAPS = [[0.4, 2.3, 'TWIN LASERS'], [2.5, 3.7, 'CHARGE SHOT'], [3.9, 4.6, 'LOCK-ON'], [5.4, 7.4, 'SMART BOMB'], [7.7, 9.0, 'BOOST'], [9.0, 11.6, 'HIT-STOP']];
  let capText = '';

  // --- state
  let fireHeld = 0, wasFireHeld = false, fireCd = 0, roll = 0, rollV = 0;
  let waveT = 0, lastLoop = -1;
  const camPos = V(0, 3, 12), camLook = V();
  const chaseCam = camera;
  chaseCam.fov = 60; chaseCam.near = 0.1; chaseCam.far = 6000; chaseCam.updateProjectionMatrix();

  const spawnWave = (u) => {
    // pre-authored waves per loop second so the demo reads well
    const s = Math.floor(u);
    if (s === 0) { for (let i = 0; i < 3; i++) spawnDrone(-10 + i * 10, 3 + (i % 2) * 3, -95 - i * 6, 'sway', 'vulture'); }
    if (s === 2) { spawnDrone(6, -1, -120, 'hold', 'mantis'); spawnDrone(-14, 5, -105, 'sway', 'hornet'); }
    if (s === 3) { spawnAsteroid(9, 2, -150, 4.5); }
    if (s === 4) { for (let i = 0; i < 4; i++) spawnDrone(-15 + i * 10, 2 + Math.sin(i) * 4, -110 - i * 8, 'sway', 'hornet'); }
    if (s === 5) { for (let i = 0; i < 6; i++) spawnDrone(-20 + i * 8, -4 + (i % 3) * 5, -60 - i * 5, 'hold', i % 2 ? 'vulture' : 'hornet'); spawnAsteroid(-12, 6, -80, 3.5); }
    if (s === 8) { for (let i = 0; i < 4; i++) spawnDrone(-12 + i * 8, 6 - i * 2, -100 - i * 10, 'sway', 'vulture'); spawnAsteroid(8, -3, -140, 5); }
    if (s === 10) { spawnDrone(0, 2, -90, 'hold', 'mantis'); spawnDrone(12, -2, -110, 'sway', 'hornet'); spawnDrone(-12, 4, -110, 'sway', 'hornet'); }
  };

  const muzzleWorld = (i) => ship.localToWorld(_c.copy(MUZZLES[i]));
  const nearestAhead = () => {
    let best = null, bd = 1e9;
    for (const t of targets) {
      if (t.dead) continue;
      const dz = shipPos.z - t.pos.z; if (dz < 8) continue;
      const d = t.pos.distanceTo(shipPos); if (d < bd) { bd = d; best = t; }
    }
    return best;
  };

  let elapsed = 0;
  function update(rawDt, time) {
    if (syncGL) drainGL();
    look.update(rawDt, time);
    planet.update(rawDt, time);
    vfx.update(rawDt, chaseCam);
    const dt = rawDt * vfx.timeScale;
    elapsed += dt;
    const u = elapsed % PERIOD;
    const loop = Math.floor(elapsed / PERIOD);
    // waves
    const sec = Math.floor(u);
    if (sec !== waveT || loop !== lastLoop) { waveT = sec; lastLoop = loop; spawnWave(u); }

    // --- ship motion: springy follow with bank & pitch
    const ax = input.axes.x, ay = input.axes.y;
    const tx = ax * 11, ty = ay * 6;
    shipVel.x += ((tx - shipPos.x) * 14 - shipVel.x * 5.5) * dt;
    shipVel.y += ((ty - shipPos.y) * 14 - shipVel.y * 5.5) * dt;
    shipPos.addScaledVector(shipVel, dt);
    const boosting = input.isHeld('boost');
    bank += ((-shipVel.x * 0.055 - ax * 0.35) - bank) * Math.min(1, dt * 7);
    pitch += ((shipVel.y * 0.04 + ay * 0.15) - pitch) * Math.min(1, dt * 7);
    if (input.wasPressed('rollR')) rollV = -14;
    if (input.wasPressed('rollL')) rollV = 14;
    roll += rollV * dt; rollV *= Math.exp(-dt * 2.2);
    if (Math.abs(rollV) < 0.3 && Math.abs(roll % (Math.PI * 2)) > 0.01) { roll += (-((roll + Math.PI) % (Math.PI * 2) - Math.PI)) * Math.min(1, dt * 8); }
    ship.position.copy(shipPos);
    ship.rotation.set(pitch, -bank * 0.35, bank * 0.4 + roll, 'YXZ');
    arwing.setBank(-bank * 1.4);
    arwing.flap(boosting ? -1 : 0.15);
    arwing.setThrust(boosting ? 1 : 0.45);
    arwing.update(dt, time, chaseCam);
    ship.updateMatrixWorld(true);
    ship.getWorldDirection(fwd).negate();
    const nz = ship.localToWorld(_a.copy(NOZZLE));
    trail.update(dt, nz, fwd, boosting ? 1 : 0.2);
    const gl_ = ship.localToWorld(_a.set(-2.75, -0.6, 1.3)); wingTrailL.update(dt, gl_, fwd, boosting ? 0.9 : 0.12);
    const gr = ship.localToWorld(_a.set(2.75, -0.6, 1.3)); wingTrailR.update(dt, gr, fwd, boosting ? 0.9 : 0.12);

    // --- weapons
    const fire = input.isHeld('fire');
    fireCd -= dt;
    if (fire) fireHeld += dt;
    if (fire && fireHeld > 0.28 && vfx.charge.state === 'idle') {
      vfx.charge.begin(() => { const m = muzzleWorld(0).clone(); m.lerp(muzzleWorld(1), 0.5); m.y += 0.3; return { pos: m, dir: fwd.clone() }; });
    }
    if (vfx.charge.state === 'charging') vfx.charge.lock(nearestAhead());
    if (fire && fireHeld <= 0.28 && fireCd <= 0) {
      fireCd = 0.09;
      const tgt = nearestAhead();
      for (let i = 0; i < 2; i++) {
        const m = muzzleWorld(i).clone();
        _b.copy(fwd);
        if (tgt) { _a.copy(tgt.pos).sub(m).normalize(); _b.lerp(_a, 0.5).normalize(); }
        vfx.laser(m, _b, { color: PALETTE.playerLaser, speed: 210, homing: tgt, turn: 3.5, damage: 1 });
      }
      vfx.shake(0.05);
    }
    if (!fire && wasFireHeld) {
      if (vfx.charge.state === 'charging') vfx.charge.release((t, p) => { killTarget(t, 2.4, {}); vfx.hitStop(0.14); vfx.shake(0.6); });
      fireHeld = 0;
    }
    wasFireHeld = fire;
    if (input.wasPressed('bomb')) {
      const p = shipPos.clone().addScaledVector(fwd, 34);
      vfx.bomb(p, { radius: 34, duration: 2.0 });
    }
    // bomb kills
    // (one kill per frame, smaller & no screen flash: a dozen full explosions at once just white out)
    if (vfx.bombRadius > 0) for (const t of targets) if (!t.dead && t.pos.distanceTo(vfx.bombCenter) < vfx.bombRadius) { killTarget(t, t.kind === 'rock' ? 1.0 : 0.65, { flash: false, quiet: true, debrisTint: t.kind === 'rock' ? ROCK_TINT : undefined }); break; }

    // --- targets
    for (const t of targets) {
      if (t.dead) continue;
      t.age += dt;
      if (t.kind === 'drone') {
        const sway = t.path === 'sway' ? Math.sin(t.age * 1.7 + t.pos.x) * 9 : 0;
        t.pos.z += t.vel.z * dt;
        t.pos.x += sway * dt;
        t.mesh.rotation.set(0, sway * 0.02, -sway * 0.06);
        if (t.pos.z > shipPos.z - 18 && t.path === 'hold') t.pos.z = shipPos.z - 18 - (t.pos.z - shipPos.z + 18) * 0.5;
        t.fireT -= dt;
        if (t.fireT <= 0 && t.pos.z < shipPos.z - 30) {
          t.fireT = 1.4 + rng.next() * 1.2;
          _a.copy(shipPos).sub(t.pos); _a.x += (rng.next() - 0.5) * 9; _a.y += (rng.next() - 0.5) * 6; _a.normalize();
          _b.copy(t.pos).addScaledVector(_a, 2);
          vfx.laser(_b, _a, { color: PALETTE.enemyLaser, speed: 95, life: 2.2, scale: 1.3, owner: 'enemy' });
        }
        // damage flash (emissive on shared-per-craft mats) + scale punch with overshoot
        if (t.flash > 0) {
          t.flash = Math.max(0, t.flash - dt * 6);
          const f = t.flash;
          for (const m of t.mesh.userData.flashMats) { m.emissive.setRGB(f, f * 0.9, f * 0.8); m.emissiveIntensity = f * 2.2; }
        }
        if (t.punch > 0) { t.punch = Math.max(0, t.punch - dt * 5); const s = 1 + 0.18 * Math.sin(t.punch * Math.PI) * t.punch; t.mesh.scale.setScalar(s); }
      } else {
        t.pos.addScaledVector(t.vel, dt);
        t.mesh.rotation.x += t.spin.x * dt; t.mesh.rotation.y += t.spin.y * dt;
        if (t.flash > 0) { t.flash = Math.max(0, t.flash - dt * 6); t.mesh.material.emissive.setRGB(t.flash, t.flash * 0.7, t.flash * 0.5); }
      }
      if (t.pos.z > shipPos.z + 30) { t.dead = true; removeTarget(t); }
    }
    for (let i = targets.length - 1; i >= 0; i--) if (targets[i].dead) targets.splice(i, 1);

    // --- camera: chase with lag, boost FOV kick, shake
    _a.set(shipPos.x * 0.55, shipPos.y * 0.45 + 2.8, shipPos.z + (boosting ? 14 : 12));
    camPos.lerp(_a, Math.min(1, dt * 4.5));
    _b.set(shipPos.x * 0.85, shipPos.y * 0.8 + 0.6, shipPos.z - 40);
    camLook.lerp(_b, Math.min(1, dt * 6));
    chaseCam.position.copy(camPos);
    chaseCam.lookAt(camLook);
    chaseCam.rotateZ(-bank * 0.25);
    const fovT = boosting ? 70 : 60;
    chaseCam.fov += (fovT - chaseCam.fov) * Math.min(1, dt * 3);
    chaseCam.updateProjectionMatrix();
    vfx.applyShake(chaseCam);
    chaseCam.updateMatrixWorld();
    if (vfx.flashAmount > 0) look.flash(vfx.flashAmount);

    // --- captions
    let txt = '';
    for (const [a, b, s] of CAPS) if (u >= a && u < b) txt = s;
    if (txt !== capText) { capText = txt; caption.textContent = txt; caption.style.opacity = txt ? '0.95' : '0'; caption.style.transform = txt ? 'translateX(-50%) skewX(-8deg) scale(1)' : 'translateX(-50%) skewX(-8deg) scale(1.15)'; }
  }

  return {
    update,
    dispose() {
      vfx.dispose();
      for (const t of targets) removeTarget(t);
      scene.remove(ship, planet, planetBounce); planet.disposePlanet(); arwing.dispose();
      look.dispose();
      caption.remove(); tag.remove();
      input.script = null;
    },
  };
}
