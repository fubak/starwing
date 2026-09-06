// PIECE: vfx — VFX library + timed showcase.
// Library lives in ./vfx.js (createVfx). This file is the demo scene: a stand-in
// fighter on rails over a planet, drone waves, and a scripted sequence that
// fires everything: twin lasers, hit sparks, charge shot + lock-on, layered
// explosions, boost trails, smart bomb, hit-stop and screen shake.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createVfx, PALETTE } from './vfx.js';
import { makeSky, makePlanet } from './space.js';

export { createVfx, PALETTE } from './vfx.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = V(), _b = V(), _c = V();

// ---------- stand-in fighter (chunky Arwing-like silhouette) ----------
function buildFighter() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xdfe6f2, metalness: 0.35, roughness: 0.32, envMapIntensity: 1.2 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x2a4fd8, metalness: 0.4, roughness: 0.35, envMapIntensity: 1.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c2230, metalness: 0.6, roughness: 0.45 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x1a3a6a, metalness: 0.1, roughness: 0.05, transmission: 0.0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2 });
  const gdiff = new THREE.MeshStandardMaterial({ color: 0x66c8ff, emissive: 0x3aa8ff, emissiveIntensity: 2.4, roughness: 0.3 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m;
  };
  // fuselage: tapered box + nose cone
  add(new THREE.CylinderGeometry(0.42, 0.62, 3.4, 6), hull, 0, 0, 0.2, Math.PI / 2, 0, 0, 1, 1, 0.75);
  add(new THREE.ConeGeometry(0.42, 2.4, 6), hull, 0, 0, -2.7, -Math.PI / 2, 0, 0, 1, 1, 0.75);
  add(new THREE.BoxGeometry(0.9, 0.5, 1.6), blue, 0, 0.1, 1.2);
  // canopy
  add(new THREE.SphereGeometry(0.42, 16, 12), glass, 0, 0.42, -0.5, 0, 0, 0, 1, 0.75, 1.9);
  // main wings: swept
  const wing = new THREE.BoxGeometry(3.2, 0.09, 1.3);
  const wl = add(wing, hull, -2.0, -0.15, 0.9, 0, 0.18, 0.12);
  const wr = add(wing, hull, 2.0, -0.15, 0.9, 0, -0.18, -0.12);
  // wing tips (blue) + G-diffusers
  add(new THREE.BoxGeometry(0.9, 0.12, 1.1), blue, -3.5, -0.25, 1.05, 0, 0.18, 0.12);
  add(new THREE.BoxGeometry(0.9, 0.12, 1.1), blue, 3.5, -0.25, 1.05, 0, -0.18, -0.12);
  add(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 12), gdiff, -3.55, -0.2, 1.2, Math.PI / 2, 0, 0);
  add(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 12), gdiff, 3.55, -0.2, 1.2, Math.PI / 2, 0, 0);
  // upper fins
  add(new THREE.BoxGeometry(0.08, 1.2, 1.0), hull, -0.6, 0.7, 1.4, 0, 0, 0.35);
  add(new THREE.BoxGeometry(0.08, 1.2, 1.0), hull, 0.6, 0.7, 1.4, 0, 0, -0.35);
  // engine
  add(new THREE.CylinderGeometry(0.5, 0.42, 0.6, 14), dark, 0, 0, 2.1, Math.PI / 2, 0, 0);
  const nozzle = add(new THREE.CylinderGeometry(0.36, 0.3, 0.2, 14), gdiff, 0, 0, 2.4, Math.PI / 2, 0, 0);
  // laser cannons under wing tips
  add(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 8), dark, -3.2, -0.42, 0.2, Math.PI / 2, 0, 0);
  add(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 8), dark, 3.2, -0.42, 0.2, Math.PI / 2, 0, 0);
  g.userData = { muzzles: [V(-3.2, -0.42, -0.6), V(3.2, -0.42, -0.6)], nozzle: V(0, 0, 2.55), wl, wr };
  return g;
}

function buildDrone(mats) {
  const g = new THREE.Group();
  const m = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  m(new THREE.OctahedronGeometry(1.1, 0), mats.body, 0, 0, 0, 0, 0, 0).scale.set(0.8, 0.6, 1.5);
  m(new THREE.BoxGeometry(3.0, 0.1, 0.9), mats.wing, 0, 0, 0.2);
  m(new THREE.BoxGeometry(0.1, 1.2, 0.8), mats.wing, 0, 0.5, 0.5);
  m(new THREE.SphereGeometry(0.32, 12, 8), mats.eye, 0, 0.1, -1.1);
  const eng = m(new THREE.CylinderGeometry(0.28, 0.2, 0.4, 10), mats.eng, 0, 0, 1.4, Math.PI / 2);
  g.userData.eng = eng;
  return g;
}

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
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b6259, roughness: 0.92, metalness: 0.05, flatShading: true });
  return new THREE.Mesh(geo, mat);
}

export async function create(ctx) {
  const { scene, camera, renderer, ui, rng, bloom, input } = ctx;
  scene.background = null;
  bloom.strength = 0.85; bloom.radius = 0.55; bloom.threshold = 0.72;
  renderer.toneMappingExposure = 1.05;

  // --- environment / lighting rig
  const sunDir = V(-0.55, 0.42, -0.72).normalize();
  const sky = makeSky(sunDir); scene.add(sky);
  const planet = makePlanet(260, sunDir); planet.position.set(180, -330, -520); scene.add(planet);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex; scene.environmentIntensity = 0.55;
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.2); sun.position.copy(sunDir).multiplyScalar(60); scene.add(sun);
  const fill = new THREE.HemisphereLight(0x3a5aa8, 0x160b22, 0.9); scene.add(fill);
  const planetBounce = new THREE.DirectionalLight(0x3f7cff, 0.7); planetBounce.position.set(0.3, -1, -0.3); scene.add(planetBounce);

  // --- vfx library
  const vfx = createVfx(ctx, { hitTest: (b) => hitTest(b) });
  if (location.search.includes('novfx')) vfx.group.visible = false;
  vfx.setSun(sunDir);

  // --- player
  const ship = buildFighter(); scene.add(ship);
  const shipPos = V(0, 0, 0), shipVel = V(); let bank = 0, pitch = 0;
  const trail = vfx.trail({ color: PALETTE.boost, hot: PALETTE.boostHot, width: 0.55, segments: 30, spacing: 0.035 });
  const wingTrailL = vfx.trail({ color: new THREE.Color(0.35, 0.8, 1.0), width: 0.16, segments: 22, spacing: 0.035 });
  const wingTrailR = vfx.trail({ color: new THREE.Color(0.35, 0.8, 1.0), width: 0.16, segments: 22, spacing: 0.035 });
  const fwd = V(0, 0, -1);

  // --- targets
  const droneMats = {
    body: new THREE.MeshStandardMaterial({ color: 0x8a1f2a, metalness: 0.45, roughness: 0.4 }),
    wing: new THREE.MeshStandardMaterial({ color: 0x3a3f4c, metalness: 0.6, roughness: 0.4 }),
    eye: new THREE.MeshStandardMaterial({ color: 0xffd080, emissive: 0xff8020, emissiveIntensity: 3, roughness: 0.3 }),
    eng: new THREE.MeshStandardMaterial({ color: 0xff6a3a, emissive: 0xff3a1a, emissiveIntensity: 2.5 }),
  };
  const targets = [];
  const spawnDrone = (x, y, z, path) => {
    const mesh = buildDrone(droneMats); mesh.position.set(x, y, z); scene.add(mesh);
    const t = { kind: 'drone', mesh, pos: mesh.position, radius: 1.7, hp: 2, dead: false, age: 0, path, vel: V(0, 0, 38), fireT: 0.6 + rng.next() };
    targets.push(t); return t;
  };
  const spawnAsteroid = (x, y, z, r) => {
    const mesh = buildAsteroid(rng, r); mesh.position.set(x, y, z);
    mesh.rotation.set(rng.next() * 6, rng.next() * 6, 0); scene.add(mesh);
    const t = { kind: 'rock', mesh, pos: mesh.position, radius: r * 1.05, hp: 4, dead: false, age: 0, spin: V(rng.range(-0.4, 0.4), rng.range(-0.4, 0.4), 0.1), vel: V(rng.range(-1, 1), rng.range(-1, 1), 22) };
    targets.push(t); return t;
  };
  const killTarget = (t, size, opts) => {
    if (t.dead) return; t.dead = true;
    scene.remove(t.mesh);
    t.mesh.traverse((o) => { if (o.geometry && t.kind === 'rock') o.geometry.dispose(); });
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
        t.hp -= b.damage; t.flash = 0.12;
        if (t.hp <= 0) killTarget(t, t.kind === 'rock' ? 2.6 : 1.4, t.kind === 'rock' ? { debrisTint: new THREE.Color(0.45, 0.4, 0.34) } : {});
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
    if (u >= 6.0 && u < 6.15) buttons.push('bomb');
    if (u > 10.4 && u < 10.9) buttons.push('rollR');
    return { x: Math.sin(u * 0.9) * 0.8 + Math.sin(u * 2.3) * 0.25, y: Math.cos(u * 0.7 + 1) * 0.6, buttons };
  };

  // --- UI: vignette/grade + caption
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(4,6,20,0.6) 100%)';
  const caption = document.createElement('div');
  caption.style.cssText = 'position:absolute;left:50%;bottom:9%;transform:translateX(-50%);font:800 26px/1 "Helvetica Neue",Arial,system-ui;letter-spacing:.32em;color:#e8f4ff;text-shadow:0 0 18px rgba(80,160,255,.9),0 2px 0 rgba(0,0,0,.6);opacity:0;transition:opacity .18s,transform .18s';
  const tag = document.createElement('div');
  tag.style.cssText = 'position:absolute;left:28px;top:24px;font:700 13px/1.4 "Helvetica Neue",Arial,system-ui;letter-spacing:.3em;color:#9fc4ff;opacity:.75';
  tag.innerHTML = 'STARWING &nbsp;//&nbsp; VFX';
  ui.append(overlay, caption, tag);
  const CAPS = [[0.4, 2.3, 'TWIN LASERS'], [2.5, 3.7, 'CHARGE SHOT'], [3.9, 4.6, 'LOCK-ON HIT'], [5.9, 7.4, 'SMART BOMB'], [7.7, 9.0, 'BOOST'], [9.0, 11.6, 'HIT-STOP']];
  let capText = '';

  // --- state
  let fireHeld = 0, wasFireHeld = false, fireCd = 0, twinSide = 1, roll = 0, rollV = 0;
  let waveT = 0, lastLoop = -1;
  const camPos = V(0, 3, 12), camLook = V();
  const chaseCam = camera;
  chaseCam.fov = 62; chaseCam.updateProjectionMatrix();

  const spawnWave = (u) => {
    // pre-authored waves per loop second so the demo reads well
    const s = Math.floor(u);
    if (s === 0) { for (let i = 0; i < 3; i++) spawnDrone(-10 + i * 10, 3 + (i % 2) * 3, -95 - i * 6, 'sway'); }
    if (s === 2) { spawnDrone(6, -1, -120, 'hold'); spawnDrone(-14, 5, -105, 'sway'); }
    if (s === 3) { spawnAsteroid(9, 2, -150, 4.5); }
    if (s === 4) { for (let i = 0; i < 4; i++) spawnDrone(-15 + i * 10, 2 + Math.sin(i) * 4, -110 - i * 8, 'sway'); }
    if (s === 5) { for (let i = 0; i < 6; i++) spawnDrone(-20 + i * 8, -4 + (i % 3) * 5, -60 - i * 5, 'hold'); spawnAsteroid(-12, 6, -80, 3.5); }
    if (s === 8) { for (let i = 0; i < 4; i++) spawnDrone(-12 + i * 8, 6 - i * 2, -100 - i * 10, 'sway'); spawnAsteroid(8, -3, -140, 5); }
    if (s === 10) { spawnDrone(0, 2, -90, 'hold'); spawnDrone(12, -2, -110, 'sway'); spawnDrone(-12, 4, -110, 'sway'); }
  };

  const muzzleWorld = (i) => ship.localToWorld(_c.copy(ship.userData.muzzles[i]));
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
    ship.rotation.set(pitch, -bank * 0.35, bank + roll, 'YXZ');
    ship.userData.wl.rotation.z = 0.12 + (boosting ? -0.25 : 0);
    ship.userData.wr.rotation.z = -0.12 + (boosting ? 0.25 : 0);
    ship.getWorldDirection(fwd).negate();
    const nz = ship.localToWorld(_a.copy(ship.userData.nozzle));
    trail.update(dt, nz, fwd, boosting ? 1 : 0.25);
    const gl = ship.localToWorld(_a.set(-3.55, -0.2, 2.0)); wingTrailL.update(dt, gl, fwd, boosting ? 0.9 : 0.15);
    const gr = ship.localToWorld(_a.set(3.55, -0.2, 2.0)); wingTrailR.update(dt, gr, fwd, boosting ? 0.9 : 0.15);

    // --- weapons
    const fire = input.isHeld('fire');
    fireCd -= dt;
    if (fire) fireHeld += dt; 
    if (fire && fireHeld > 0.28 && vfx.charge.state === 'idle') {
      vfx.charge.begin(() => { const m = muzzleWorld(0).clone(); m.lerp(muzzleWorld(1), 0.5); m.y += 0.1; return { pos: m, dir: fwd.clone() }; });
    }
    if (vfx.charge.state === 'charging') vfx.charge.lock(nearestAhead());
    if (fire && fireHeld <= 0.28 && fireCd <= 0) {
      fireCd = 0.09;
      twinSide = -twinSide;
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
    if (vfx.bombRadius > 0) for (const t of targets) if (!t.dead && t.pos.distanceTo(vfx.bombCenter) < vfx.bombRadius) killTarget(t, t.kind === 'rock' ? 2.4 : 1.3, {});

    // --- targets
    for (const t of targets) {
      if (t.dead) continue;
      t.age += dt;
      if (t.kind === 'drone') {
        const sway = t.path === 'sway' ? Math.sin(t.age * 1.7 + t.pos.x) * 9 : 0;
        t.pos.z += t.vel.z * dt;
        t.pos.x += sway * dt;
        t.mesh.rotation.z = -sway * 0.06; t.mesh.rotation.y = Math.PI + sway * 0.02;
        if (t.pos.z > shipPos.z - 18 && t.path === 'hold') t.pos.z = shipPos.z - 18 - (t.pos.z - shipPos.z + 18) * 0.5;
        t.fireT -= dt;
        if (t.fireT <= 0 && t.pos.z < shipPos.z - 30) {
          t.fireT = 1.4 + rng.next() * 1.2;
          _a.copy(shipPos).sub(t.pos); _a.x += (rng.next() - 0.5) * 9; _a.y += (rng.next() - 0.5) * 6; _a.normalize();
          _b.copy(t.pos).addScaledVector(_a, 2);
          vfx.laser(_b, _a, { color: PALETTE.enemyLaser, speed: 95, life: 2.2, scale: 1.3, owner: 'enemy' });
        }
        if (t.flash > 0) { t.flash -= dt; droneMats.body.emissive.setRGB(0.5, 0.2, 0.15); } else droneMats.body.emissive.setRGB(0, 0, 0);
      } else {
        t.pos.addScaledVector(t.vel, dt);
        t.mesh.rotation.x += t.spin.x * dt; t.mesh.rotation.y += t.spin.y * dt;
      }
      if (t.pos.z > shipPos.z + 30) { t.dead = true; scene.remove(t.mesh); }
    }
    for (let i = targets.length - 1; i >= 0; i--) if (targets[i].dead) targets.splice(i, 1);

    // --- camera: chase with lag, boost FOV kick, shake
    _a.set(shipPos.x * 0.55, shipPos.y * 0.45 + 2.6, shipPos.z + (boosting ? 13.5 : 11.5));
    camPos.lerp(_a, Math.min(1, dt * 4.5));
    _b.set(shipPos.x * 0.85, shipPos.y * 0.8 + 0.4, shipPos.z - 40);
    camLook.lerp(_b, Math.min(1, dt * 6));
    chaseCam.position.copy(camPos);
    chaseCam.lookAt(camLook);
    chaseCam.rotateZ(-bank * 0.25);
    const fovT = boosting ? 70 : 62;
    chaseCam.fov += (fovT - chaseCam.fov) * Math.min(1, dt * 3);
    chaseCam.updateProjectionMatrix();
    vfx.applyShake(chaseCam);
    sky.position.copy(chaseCam.position);

    // --- captions
    let txt = '';
    for (const [a, b, s] of CAPS) if (u >= a && u < b) txt = s;
    if (txt !== capText) { capText = txt; caption.textContent = txt; caption.style.opacity = txt ? '0.95' : '0'; caption.style.transform = txt ? 'translateX(-50%) scale(1)' : 'translateX(-50%) scale(1.15)'; }
  }

  return {
    update,
    dispose() {
      vfx.dispose();
      for (const t of targets) scene.remove(t.mesh);
      scene.remove(ship, sky, planet, sun, fill, planetBounce);
      scene.environment = null; envTex.dispose(); pmrem.dispose();
      overlay.remove(); caption.remove(); tag.remove();
    },
  };
}
