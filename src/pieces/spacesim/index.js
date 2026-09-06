// PIECE: spacesim — all-range 6DOF space flight through an asteroid belt near a planet.
// U-turn (boost + pull), somersault (brake + pull), barrel roll (Q/E), lasers, drones w/ target markers,
// radar, speed lines, laggy chase camera with roll. Lighting / sky / grade come from the shared lookdev rig.
import * as THREE from 'three';
import { applyLook } from '../lookdev/index.js';
import { buildPlanet, SUN_DIR } from './sky.js';
import { buildAsteroidBelt } from './asteroids.js';
import { buildFallbackArwing } from './arwing.js';
import { buildDrone } from './drone.js';
import { createHud } from './hud.js';

const FWD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export async function create(ctx) {
  const { scene, camera, renderer, bloom, input, ui, rng, size, audio } = ctx;

  // ---------------- look (lights, sky dome, env map, grade, bloom)
  const look = applyLook(ctx, 'space', { shadowSize: 10, shadowMap: 1024 });
  // key light from the upper right so the belt is side-lit (backlit rocks read as black blobs)
  look.preset.sun.dir.set(0.80, 0.46, -0.24).normalize();
  SUN_DIR.copy(look.preset.sun.dir);
  // tweak the resolved preset (setFocus re-pushes it every frame)
  Object.assign(look.preset.bloom, { strength: 0.6, radius: 0.5, threshold: 0.82 });
  look.preset.exposure = 0.95; look.preset.envIntensity = 0.8;
  look.preset.sun.glow = 0.55;
  look.preset.sky.nebula = 1.0;
  look.preset.hemi.intensity = 1.1; look.preset.fill.intensity = 1.4;
  look.preset.fill.dir.set(-0.6, 0.2, 0.75).normalize();
  look.preset.grade.vignette = 0.38; look.preset.grade.saturation = 1.15;
  look.setPreset(look.preset, true); // rebuild env map / sky with the tweaked preset
  const envMap = scene.environment;

  // ---------------- planet + moon (ahead-left of the spawn heading so the opening shot frames it)
  const planetPos = new THREE.Vector3(-0.40, 0.12, -1).normalize().multiplyScalar(3500);
  const planet = buildPlanet(renderer, { radius: 1250, position: planetPos, preset: look.preset });
  scene.add(planet.group);

  // ---------------- asteroid belt
  const belt = buildAsteroidBelt(rng, { count: 720, extent: 560, thickness: 130, envMap });
  scene.add(belt.group);

  // ---------------- ship
  // dynamic import so a mid-edit / renamed ship export degrades to the fallback instead of killing the piece
  let rig = null, arwing = null;
  try {
    const shipMod = await import('../ship/index.js');
    if (typeof shipMod.buildArwing === 'function') { rig = shipMod.buildArwing({ THREE }); arwing = rig?.group?.isObject3D ? rig.group : rig?.isObject3D ? rig : null; }
  } catch (e) { console.warn('spacesim: ship import failed, using fallback', e); }
  if (!arwing) { rig = null; arwing = buildFallbackArwing({ envMap }); }
  const shipRoot = new THREE.Group(); // world pose
  const shipBank = new THREE.Group(); // visual bank / barrel roll
  shipBank.add(arwing);
  shipRoot.add(shipBank);
  scene.add(shipRoot);
  const flame = arwing.getObjectByName('flame');
  const engineGlow = arwing.getObjectByName('engineGlow');

  const ship = {
    pos: new THREE.Vector3(0, 0, 0), quat: new THREE.Quaternion(), speed: 55,
    pitchRate: 0, yawRate: 0, rollRate: 0, bank: 0, boost: 0, boostMeter: 1, maneuver: null, fireCd: 0,
  };
  const SPEED = { cruise: 55, boost: 130, brake: 22 };
  belt.clearAround(ship.pos, 70);
  // clear the first stretch of the flight path so the opening isn't a face full of rock
  for (let i = 1; i <= 8; i++) belt.clearAround(_v.set(0, 0, -i * 40), 40);

  // ---------------- drones (targets)
  const drones = [];
  const anchor = new THREE.Vector3(); // laggy centre drones orbit
  const droneNames = ['VENOM-1', 'VENOM-2', 'VENOM-3', 'VENOM-4', 'VENOM-5', 'VENOM-6'];
  const droneKit = buildDrone(envMap);
  for (let i = 0; i < 6; i++) {
    const g = droneKit.make();
    scene.add(g);
    drones.push({
      obj: g, name: droneNames[i], phase: rng.range(0, 6.28), r: rng.range(150, 360), spd: rng.range(0.12, 0.28) * rng.sign(),
      tilt: rng.range(-0.6, 0.6), hp: 3, dead: 0, prev: new THREE.Vector3(), hit: 0,
    });
  }

  // ---------------- lasers
  const boltGeo = new THREE.CapsuleGeometry(0.28, 5.5, 4, 10); boltGeo.rotateX(Math.PI / 2);
  const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.6, 0.5), toneMapped: false, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const boltCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 5.0, 3.0), toneMapped: false });
  const boltHalo = new THREE.SpriteMaterial({ map: (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(180,255,190,0.9)'); gr.addColorStop(0.4, 'rgba(60,255,110,0.35)'); gr.addColorStop(1, 'rgba(0,255,80,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  const bolts = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(boltGeo, boltMat);
    const c = new THREE.Mesh(boltGeo, boltCore); c.scale.set(0.35, 0.35, 0.9); m.add(c);
    const h = new THREE.Sprite(boltHalo); h.scale.setScalar(3.2); m.add(h);
    m.visible = false; scene.add(m);
    bolts.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
  }
  const muzzleL = new THREE.Vector3(-2.9, -0.55, 0.3), muzzleR = new THREE.Vector3(2.9, -0.55, 0.3);
  let muzzleSide = 0;
  const muzzleFlash = new THREE.PointLight(0x66ff88, 0, 30, 2); scene.add(muzzleFlash);
  function fire() {
    const b = bolts.find((x) => !x.mesh.visible); if (!b) return;
    const m = muzzleSide++ % 2 === 0 ? muzzleL : muzzleR;
    b.mesh.position.copy(m).applyQuaternion(ship.quat).add(ship.pos);
    // converge bolts toward the reticle point ahead
    _v.copy(FWD).applyQuaternion(ship.quat).multiplyScalar(220).add(ship.pos).sub(b.mesh.position).normalize();
    b.vel.copy(_v).multiplyScalar(460 + ship.speed);
    b.mesh.lookAt(_v.add(b.mesh.position));
    b.mesh.visible = true; b.life = 1.4;
    muzzleFlash.position.copy(b.mesh.position); muzzleFlash.intensity = 40;
    audio.tone?.({ type: 'square', f0: 1400, f1: 500, dur: 0.09, gain: 0.08 });
  }

  // ---------------- explosions
  const exTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,220,120,0.9)'); gr.addColorStop(0.6, 'rgba(255,110,40,0.35)'); gr.addColorStop(1, 'rgba(255,60,20,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const explosions = [];
  const exLight = new THREE.PointLight(0xffa050, 0, 120, 2); scene.add(exLight);
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: exTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const debris = new THREE.Points(
      (() => { const g = new THREE.BufferGeometry(); const p = new Float32Array(60 * 3); const d = new Float32Array(60 * 3); for (let k = 0; k < 60; k++) { const v = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize().multiplyScalar(0.4 + rng.next()); d[k * 3] = v.x; d[k * 3 + 1] = v.y; d[k * 3 + 2] = v.z; } g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('dir', new THREE.BufferAttribute(d, 3)); return g; })(),
      new THREE.PointsMaterial({ color: 0xffd090, size: 1.2, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    s.visible = ring.visible = debris.visible = false; scene.add(s, ring, debris);
    explosions.push({ s, ring, debris, t: 1, dur: 0.9, scale: 1 });
  }
  function explode(p, scale = 1) {
    const e = explosions.find((x) => x.t >= x.dur) ?? explosions[0];
    e.t = 0; e.scale = scale; e.s.position.copy(p); e.ring.position.copy(p); e.debris.position.copy(p); e.ring.quaternion.copy(camera.quaternion);
    e.s.visible = e.ring.visible = e.debris.visible = true;
    if (scale > 1) { exLight.position.copy(p); exLight.intensity = 900 * scale; }
    audio.noise?.({ dur: 0.5, gain: 0.25, cutoff: 600 });
  }

  // ---------------- speed lines (boost streaks in camera space)
  const N_LINES = 110;
  const linePos = new Float32Array(N_LINES * 6);
  const lineCol = new Float32Array(N_LINES * 6);
  const lineData = [];
  for (let i = 0; i < N_LINES; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(6, 18);
    lineData.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: rng.range(-60, -8), len: rng.range(2, 6) });
    const c = 0.35 + rng.next() * 0.4;
    lineCol.set([0.55 * c, 0.85 * c, 1.0 * c, 0, 0, 0], i * 6);
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  lineGeo.setAttribute('color', new THREE.BufferAttribute(lineCol, 3));
  const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const speedLines = new THREE.LineSegments(lineGeo, lineMat); speedLines.frustumCulled = false;
  camera.add(speedLines); scene.add(camera);

  // ---------------- HUD
  const hud = createHud(ui);
  hud.resize(size.x, size.y);
  hud.state.maxSpeed = SPEED.boost;
  hud.state.planetPos = planet.group.position;

  // ---------------- camera
  camera.fov = 60; camera.near = 0.3; camera.far = 12000; camera.updateProjectionMatrix();
  const camQuat = new THREE.Quaternion();
  const camPos = new THREE.Vector3(0, 3, 14);
  let camShake = 0, camPull = 0;
  const camOffset = new THREE.Vector3(0, 2.2, 9.6);

  // ---------------- autoplay script
  input.script = (t) => {
    const B = [];
    let x = 0, y = 0;
    const s = t % 24;
    if (s < 3) { x = Math.sin(t * 1.2) * 0.45; y = Math.sin(t * 0.7) * 0.2; if (s > 1.2) B.push('fire'); }
    else if (s < 6) { x = 0.55; y = 0.15; B.push('boost'); if ((t * 4) % 2 < 1) B.push('fire'); }
    else if (s < 6.35) { y = 1; }
    else if (s < 6.5) { y = 1; B.push('brake'); } // somersault
    else if (s < 9) { x = -0.35 * Math.sin((s - 6.5) * 2); B.push('fire'); }
    else if (s < 9.2) { B.push('rollR'); }
    else if (s < 11.5) { x = 0.3; y = -0.15; if ((t * 3) % 2 < 1.2) B.push('fire'); }
    else if (s < 11.8) { y = 1; }
    else if (s < 12.0) { y = 1; B.push('boost'); } // U-turn
    else if (s < 15) { x = Math.sin(t) * 0.4; B.push('boost'); }
    else if (s < 18) { x = -0.5; y = 0.2; if ((t * 4) % 2 < 1) B.push('fire'); }
    else if (s < 18.2) { B.push('rollL'); }
    else if (s < 21) { y = -0.3; x = 0.4; B.push('boost'); }
    else { x = Math.sin(t * 0.8) * 0.4; y = Math.cos(t * 0.5) * 0.3; B.push('fire'); }
    return { x, y, buttons: B };
  };

  // ---------------- maneuvers
  function startManeuver(type) {
    if (ship.maneuver) return;
    const dur = type === 'somersault' ? 1.45 : type === 'uturn' ? 1.5 : 0.62;
    ship.maneuver = { type, t: 0, dur, q0: ship.quat.clone(), applied: 0, dir: 1 };
    hud.callout(type === 'somersault' ? 'SOMERSAULT' : type === 'uturn' ? 'U-TURN' : 'BARREL ROLL', type === 'barrel' ? 1.0 : 1.7);
    camShake = Math.max(camShake, type === 'barrel' ? 0.2 : 0.4);
    audio.tone?.({ type: 'sawtooth', f0: 220, f1: type === 'barrel' ? 660 : 440, dur: 0.5, gain: 0.08 });
  }
  function maneuverPose(m, k) {
    // returns {pitch, roll, bank} angles at normalised progress k with anticipation + overshoot
    if (m.type === 'somersault') {
      // dip nose briefly (anticipation), full 360 loop, settle with slight overshoot
      const ant = k < 0.1 ? -0.18 * Math.sin((k / 0.1) * Math.PI) : 0;
      const kk = THREE.MathUtils.clamp((k - 0.06) / 0.86, 0, 1);
      let pitch = easeInOutCubic(kk) * Math.PI * 2;
      if (k > 0.92) pitch += 0.10 * Math.sin(((k - 0.92) / 0.08) * Math.PI);
      return { pitch: pitch + ant, roll: 0, bank: 0 };
    }
    if (m.type === 'uturn') {
      const kk = THREE.MathUtils.clamp((k - 0.05) / 0.85, 0, 1);
      const e = easeInOutCubic(kk);
      const pitch = e * Math.PI;
      let roll = THREE.MathUtils.clamp((k - 0.45) / 0.5, 0, 1); roll = easeInOutCubic(roll) * Math.PI;
      if (k > 0.93) roll += 0.08 * Math.sin(((k - 0.93) / 0.07) * Math.PI);
      return { pitch, roll, bank: 0 };
    }
    // barrel roll: fast 360 visual roll with a slight lateral hop
    const e = easeInOutCubic(k);
    return { pitch: 0, roll: 0, bank: e * Math.PI * 2 * m.dir };
  }

  // ---------------- update
  const tmpEuler = new THREE.Euler();
  let lockedIdx = 0;

  function update(dt, t) {
    dt = Math.min(dt, 0.05);
    hud.state.time = t;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (Math.abs(size.x * dpr - hud.canvas.width) > 1 || Math.abs(size.y * dpr - hud.canvas.height) > 1) hud.resize(size.x, size.y);

    // ---- input
    const ax = input.axes.x, ay = input.axes.y;
    const boostHeld = input.isHeld('boost') && ship.boostMeter > 0.02;
    const brakeHeld = input.isHeld('brake');
    if (!ship.maneuver) {
      if (input.wasPressed('brake') && ay > 0.5) startManeuver('somersault');
      else if (input.wasPressed('boost') && ay > 0.5) startManeuver('uturn');
      else if (input.wasPressed('rollL')) { startManeuver('barrel'); ship.maneuver.dir = 1; }
      else if (input.wasPressed('rollR')) { startManeuver('barrel'); ship.maneuver.dir = -1; }
    }

    // ---- speed
    const targetSpeed = ship.maneuver && ship.maneuver.type !== 'barrel' ? SPEED.cruise * 0.7 : boostHeld ? SPEED.boost : brakeHeld ? SPEED.brake : SPEED.cruise;
    ship.speed += (targetSpeed - ship.speed) * damp(boostHeld ? 3.5 : 2.2, dt);
    ship.boost += (((boostHeld && !ship.maneuver) ? 1 : 0) - ship.boost) * damp(4, dt);
    ship.boostMeter = THREE.MathUtils.clamp(ship.boostMeter + (boostHeld ? -0.3 : 0.22) * dt, 0, 1);

    // ---- orientation
    const m = ship.maneuver;
    if (m) {
      m.t += dt;
      const k = Math.min(1, m.t / m.dur);
      const pose = maneuverPose(m, k);
      if (m.type === 'barrel') {
        ship.bank = pose.bank; // visual
        // small lateral hop with anticipation
        _v.copy(RIGHT).applyQuaternion(ship.quat).multiplyScalar(-m.dir * Math.sin(k * Math.PI) * 18 * dt);
        ship.pos.add(_v);
        ship.yawRate += (ax * 1.1 - ship.yawRate) * damp(6, dt); ship.pitchRate *= 1 - damp(6, dt);
        _q.setFromEuler(tmpEuler.set(ship.pitchRate * dt, -ship.yawRate * dt, 0, 'XYZ'));
        ship.quat.multiply(_q);
      } else {
        _q.setFromEuler(tmpEuler.set(pose.pitch, 0, 0));
        _q2.setFromEuler(tmpEuler.set(0, 0, pose.roll));
        ship.quat.copy(m.q0).multiply(_q).multiply(_q2);
        ship.pitchRate = ship.yawRate = 0;
        ship.bank *= 1 - damp(8, dt);
      }
      if (k >= 1) { ship.maneuver = null; if (m.type === 'barrel') ship.bank = 0; }
    } else {
      const agility = brakeHeld ? 1.35 : boostHeld ? 0.7 : 1.0;
      ship.pitchRate += (ay * 1.35 * agility - ship.pitchRate) * damp(5, dt);
      ship.yawRate += (ax * 1.15 * agility - ship.yawRate) * damp(5, dt);
      ship.rollRate *= 1 - damp(5, dt);
      _q.setFromEuler(tmpEuler.set(ship.pitchRate * dt, -ship.yawRate * dt, ship.rollRate * dt, 'XYZ'));
      ship.quat.multiply(_q).normalize();
      // visual bank into the turn, with a bit of overshoot when the stick returns
      const bankTarget = -ax * 0.85 - ship.yawRate * 0.25;
      ship.bank += (bankTarget - ship.bank) * damp(6, dt);
    }

    // ---- move
    _v.copy(FWD).applyQuaternion(ship.quat).multiplyScalar(ship.speed * dt);
    ship.pos.add(_v);
    shipRoot.position.copy(ship.pos); shipRoot.quaternion.copy(ship.quat);
    shipBank.rotation.set(ship.pitchRate * 0.12, 0, ship.bank);
    if (rig) {
      rig.setThrust(THREE.MathUtils.clamp(0.35 + ship.boost * 0.65 + (ship.speed - SPEED.cruise) / 200, 0, 1));
      rig.setBank(THREE.MathUtils.clamp(ax * 0.6 + ship.yawRate * 0.3, -1, 1));
      rig.flap(THREE.MathUtils.clamp(-ay * 0.6 + (brakeHeld ? 0.8 : 0) - ship.boost * 0.3, -1, 1));
      rig.setHover(0.4);
      rig.update(dt, t, camera);
    }
    if (flame) { flame.material.uniforms.uTime.value = t; flame.material.uniforms.uPower.value = 0.6 + ship.boost * 1.0 + 0.25 * (ship.speed / SPEED.cruise); flame.scale.set(1 + ship.boost * 0.3, 1 + ship.boost * 0.3, 0.8 + ship.boost * 1.4 + 0.3 * ship.speed / SPEED.cruise); }
    if (engineGlow) engineGlow.scale.setScalar(1 + ship.boost * 0.5 + 0.06 * Math.sin(t * 30));

    // ---- fire
    ship.fireCd -= dt;
    muzzleFlash.intensity *= 1 - damp(30, dt);
    if (input.isHeld('fire') && ship.fireCd <= 0 && !(m && m.type !== 'barrel')) { fire(); ship.fireCd = 0.13; }
    for (const b of bolts) {
      if (!b.mesh.visible) continue;
      b.life -= dt; b.mesh.position.addScaledVector(b.vel, dt);
      if (b.life <= 0) { b.mesh.visible = false; continue; }
      for (const d of drones) {
        if (d.dead > 0) continue;
        if (b.mesh.position.distanceToSquared(d.obj.position) < 5.5 * 5.5) {
          b.mesh.visible = false; d.hp--; d.hit = 1; look.flash(0.12);
          explode(b.mesh.position, 0.35);
          if (d.hp <= 0) { d.dead = 4; d.obj.visible = false; explode(d.obj.position, 1.6); camShake = Math.max(camShake, 0.35); look.flash(0.45); }
          break;
        }
      }
      // bolts that hit rock
      const rock = belt.hitTest(b.mesh.position);
      if (rock) { b.mesh.visible = false; explode(b.mesh.position, 0.25); }
    }

    // ---- drones
    anchor.lerp(ship.pos, damp(0.35, dt));
    for (const d of drones) {
      if (d.dead > 0) { d.dead -= dt; if (d.dead <= 0) { d.hp = 3; d.obj.visible = true; d.phase += 2; } }
      const a = d.phase + t * d.spd;
      d.prev.copy(d.obj.position);
      d.obj.position.set(anchor.x + Math.cos(a) * d.r, anchor.y + Math.sin(a * 1.7 + d.tilt) * 55, anchor.z + Math.sin(a) * d.r * 0.85);
      _v.copy(d.obj.position).sub(d.prev);
      if (_v.lengthSq() > 1e-6 && dt > 0) { _v2.copy(d.obj.position).add(_v); d.obj.lookAt(_v2); d.obj.rotateZ(Math.sin(a * 3) * 0.4); }
      d.hit *= 1 - damp(8, dt);
      droneKit.animate(d.obj, t, d.hit);
    }
    // lock nearest drone in front
    let best = -1, bestScore = -Infinity;
    _v2.copy(FWD).applyQuaternion(ship.quat);
    drones.forEach((d, i) => {
      if (d.dead > 0) return;
      _v.copy(d.obj.position).sub(ship.pos); const dist = _v.length(); _v.divideScalar(dist);
      const sc = _v.dot(_v2) - dist / 900;
      if (sc > bestScore) { bestScore = sc; best = i; }
    });
    lockedIdx = best;
    hud.state.targets = drones.filter((d) => d.dead <= 0).map((d) => ({ pos: d.obj.position, dist: d.obj.position.distanceTo(ship.pos), name: d.name, locked: drones.indexOf(d) === lockedIdx }));

    // ---- explosions
    exLight.intensity *= 1 - damp(6, dt);
    for (const e of explosions) {
      if (e.t >= e.dur) continue;
      e.t += dt; const k = e.t / e.dur;
      const sc = e.scale * (8 + 26 * (1 - Math.pow(1 - k, 3)));
      e.s.scale.setScalar(sc); e.s.material.opacity = Math.pow(1 - k, 1.6) * 1.4;
      e.ring.scale.setScalar(e.scale * (2 + 60 * (1 - Math.pow(1 - k, 2)))); e.ring.material.opacity = (1 - k) * 0.8;
      const pa = e.debris.geometry.attributes.position, da = e.debris.geometry.attributes.dir;
      const r = e.scale * 30 * (1 - Math.pow(1 - k, 2));
      for (let i = 0; i < pa.count; i++) pa.setXYZ(i, da.getX(i) * r, da.getY(i) * r, da.getZ(i) * r);
      pa.needsUpdate = true; e.debris.material.opacity = 1 - k; e.debris.material.size = e.scale * (0.5 + k);
      if (e.t >= e.dur) e.s.visible = e.ring.visible = e.debris.visible = false;
    }

    // ---- belt wrap + spin, planet spin
    belt.update(dt, ship.pos);
    planet.update(t);

    // ---- camera: laggy chase w/ roll, fov kick on boost, shake
    _q.copy(ship.quat);
    // add a fraction of the visual bank so the camera rolls with the ship
    _q2.setFromAxisAngle(FWD, ship.bank * 0.35); _q.multiply(_q2);
    camQuat.slerp(_q, damp(m && m.type !== 'barrel' ? 3.2 : 5.5, dt));
    // position: rigid to the ship (a lerp here trails by speed/rate and shrinks the ship at boost); only the rotation lags
    camPull += ((ship.boost * 1.8 + (brakeHeld ? -0.8 : 0) + (m && m.type !== 'barrel' ? 2.5 : 0)) - camPull) * damp(4, dt);
    _v.copy(camOffset); _v.z += camPull; _v.applyQuaternion(camQuat).add(ship.pos);
    camPos.copy(_v);
    camShake *= 1 - damp(4, dt);
    const sh = camShake + ship.boost * 0.04;
    camera.position.copy(camPos);
    camera.position.x += (rng.next() - 0.5) * sh; camera.position.y += (rng.next() - 0.5) * sh;
    // look at a point ahead of the ship, but pull it back toward the ship during loops so the Arwing stays framed
    _v.copy(FWD).applyQuaternion(ship.quat).multiplyScalar(m && m.type !== 'barrel' ? 8 : 40).add(ship.pos);
    camera.up.copy(UP).applyQuaternion(camQuat);
    camera.lookAt(_v);
    const fovT = 60 + ship.boost * 14 + (brakeHeld ? -4 : 0);
    if (Math.abs(camera.fov - fovT) > 0.01) { camera.fov += (fovT - camera.fov) * damp(5, dt); camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    look.setFocus(ship.pos);
    look.update(dt, t);

    // ---- speed lines (in camera space)
    const lineAlpha = THREE.MathUtils.clamp((ship.speed - SPEED.cruise * 1.1) / (SPEED.boost - SPEED.cruise * 1.1), 0, 1);
    lineMat.opacity = lineAlpha * 0.65;
    if (lineAlpha > 0.001) {
      const adv = ship.speed * dt * 2.2;
      for (let i = 0; i < N_LINES; i++) {
        const L = lineData[i]; L.z += adv; if (L.z > -2) L.z = -60 - rng.range(0, 10);
        const len = L.len * (0.6 + lineAlpha * 1.4);
        linePos[i * 6] = L.x; linePos[i * 6 + 1] = L.y; linePos[i * 6 + 2] = L.z;
        linePos[i * 6 + 3] = L.x; linePos[i * 6 + 4] = L.y; linePos[i * 6 + 5] = L.z - len;
      }
      lineGeo.attributes.position.needsUpdate = true;
    }

    // ---- hud
    hud.state.boost = ship.boost; hud.state.speed = ship.speed; hud.state.boostMeter = ship.boostMeter;
    hud.state.shipQuat.copy(ship.quat); hud.state.shipPos.copy(ship.pos);
    hud.draw(camera, t, dt);
  }

  function dispose() {
    hud.dispose();
    camera.remove(speedLines); scene.remove(camera); camera.up.set(0, 1, 0); camera.fov = 60; camera.near = 0.1; camera.far = 5000; camera.updateProjectionMatrix();
    planet.dispose(); belt.dispose(); rig?.dispose?.(); droneKit.dispose();
    look.dispose();
    scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) { o.geometry?.dispose?.(); const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const mm of mats) mm?.dispose?.(); } });
    scene.clear();
    input.script = null;
  }

  return { update, dispose };
}
