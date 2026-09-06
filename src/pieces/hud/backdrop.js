// Space backdrop for the HUD showcase. Uses the shared `lookdev` rig (sky,
// lights, PMREM env, colour grade) and the real `ship` Arwing so the HUD is
// judged over a frame that looks like the game, plus a few enemy fighters
// to lock onto and a stream of laser bolts.
import * as THREE from 'three';
import { applyLook, makePlanet, PRESETS } from '../lookdev/index.js';
import { buildArwing } from '../ship/index.js';

export function createBackdrop(ctx) {
  const { scene, camera } = ctx;
  const group = new THREE.Group(); scene.add(group);
  const disposables = [];

  // --- look rig (sky dome with stars/nebula, sun, hemi, fill, env, grade)
  // 'space' preset with the sun swung out to the upper right, just past the
  // frame edge, so its glow rakes in from the corner instead of blowing out
  // the centre of the view.
  const preset = JSON.parse(JSON.stringify(PRESETS.space));
  preset.name = 'hud-space';
  preset.sun.dir = [0.92, 0.36, -0.16];
  preset.sun.glow = 0.7;
  preset.fill.dir = [-0.6, 0.2, 0.75];
  const look = applyLook(ctx, preset, { shadowSize: 8, shadowMap: 1024 });
  look.setFocus(new THREE.Vector3(0, -0.6, -7));

  // --- planet, low-left, limb catching the sun
  const planet = makePlanet({ radius: 520, seed: 11, preset: look.preset });
  planet.position.set(-720, -460, -1500);
  group.add(planet);

  // --- Arwing (chase framing)
  const ship = buildArwing({ THREE });
  ship.group.position.set(0, -0.6, -9);
  ship.group.scale.setScalar(0.6);
  group.add(ship.group);
  ship.setThrust(0.6);
  // camera-side key so the Arwing's hull reads from behind (sun is ahead of us)
  const chase = new THREE.DirectionalLight(0xdce9ff, 1.4); chase.position.set(3, 5, 8); chase.target = ship.group; group.add(chase);
  disposables.push(chase);
  const shipState = { x: 0, y: 0, spin: 0, pitch: 0 };

  // --- enemy fighters (dark red, hot engine glow) weaving far ahead
  const enemies = [];
  const eBody = new THREE.MeshStandardMaterial({ color: 0x6e1e22, metalness: 0.55, roughness: 0.38 });
  const eTrim = new THREE.MeshStandardMaterial({ color: 0xc9c2b8, metalness: 0.5, roughness: 0.4 });
  const eGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 1.2, 0.5), toneMapped: false });
  const eGeo = new THREE.ConeGeometry(0.55, 2.6, 6); eGeo.rotateX(Math.PI / 2);
  const wGeo = new THREE.BoxGeometry(3.2, 0.08, 1.0);
  const finGeo = new THREE.BoxGeometry(0.08, 0.9, 0.8);
  for (let i = 0; i < 4; i++) {
    const e = new THREE.Group();
    e.add(new THREE.Mesh(eGeo, eBody));
    const w = new THREE.Mesh(wGeo, eTrim); w.position.z = 0.5; e.add(w);
    const f = new THREE.Mesh(finGeo, eBody); f.position.set(0, 0.5, 0.8); e.add(f);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), eGlow); glow.position.z = 1.35; e.add(glow);
    const light = new THREE.PointLight(0xff6a30, 6, 12, 2); light.position.z = 1.6; e.add(light);
    e.userData = { phase: i * 1.7, rad: 6 + i * 2.5 };
    e.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    group.add(e); enemies.push(e);
  }
  disposables.push(...enemies);

  // --- laser bolts from the wing cannons
  const boltGeo = new THREE.CapsuleGeometry(0.07, 1.8, 4, 8); boltGeo.rotateX(Math.PI / 2);
  const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 2.6, 1.1), toneMapped: false });
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 4, 3), toneMapped: false });
  const coreGeo = new THREE.CapsuleGeometry(0.03, 1.6, 3, 6); coreGeo.rotateX(Math.PI / 2);
  const bolts = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(boltGeo, boltMat); m.add(new THREE.Mesh(coreGeo, coreMat)); m.visible = false; group.add(m); bolts.push(m);
  }
  disposables.push(...bolts);
  let fireCd = 0;
  const muzzle = new THREE.Vector3(), fwd = new THREE.Vector3(0, 0, -1);
  function fire() {
    for (const s of [-1, 1]) {
      const m = bolts.find((b) => !b.visible); if (!m) return;
      muzzle.set(s * 3.1, -0.35, -1.5).multiplyScalar(0.6).applyQuaternion(ship.group.quaternion).add(ship.group.position);
      m.position.copy(muzzle); m.quaternion.copy(ship.group.quaternion); m.visible = true; m.userData.life = 0;
      m.userData.dir = fwd.set(0, 0, -1).applyQuaternion(ship.group.quaternion).clone();
    }
  }

  // --- speed streaks (thin additive lines rushing past on boost)
  const NS = 60;
  const sPos = new Float32Array(NS * 2 * 3);
  const streakGeo = new THREE.BufferGeometry(); streakGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const streakMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0.6, 0.9, 1.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const streaks = new THREE.LineSegments(streakGeo, streakMat); group.add(streaks); disposables.push(streaks);
  const sSeed = []; for (let i = 0; i < NS; i++) sSeed.push({ x: (Math.random() - 0.5) * 30, y: (Math.random() - 0.5) * 18, z: Math.random() * 80 });
  let streakAmt = 0;

  camera.fov = 58; camera.near = 0.1; camera.far = 6000;
  camera.position.set(0, 1.6, 4.5); camera.lookAt(0, -0.2, -20); camera.updateProjectionMatrix();
  const camBase = camera.position.clone();
  const lookAt = new THREE.Vector3(0, -0.2, -20);

  function update(dt, t, input) {
    look.update(dt, t);
    planet.update?.(dt, t);
    planet.rotation.y = t * 0.006;
    // ship: drift + bank with input, barrel roll on Q/E, thrust on boost
    const ax = input?.axes.x ?? 0, ay = input?.axes.y ?? 0;
    shipState.x += ((ax * 3.2) - shipState.x) * Math.min(1, dt * 3.5);
    shipState.y += ((ay * 2.0) - shipState.y) * Math.min(1, dt * 3.5);
    shipState.pitch += ((ay * 0.28) - shipState.pitch) * Math.min(1, dt * 5);
    if (input?.isHeld('rollL') || input?.isHeld('rollR')) shipState.spin += dt * 9;
    else shipState.spin += (Math.round(shipState.spin / (Math.PI * 2)) * Math.PI * 2 - shipState.spin) * Math.min(1, dt * 8);
    ship.setBank(ax);
    ship.flap(ay * 0.6);
    const boost = input?.isHeld('boost'), brake = input?.isHeld('brake');
    ship.setThrust(boost ? 1 : brake ? 0.15 : 0.6);
    ship.group.rotation.set(shipState.pitch, -ax * 0.14, shipState.spin);
    ship.group.position.set(shipState.x, shipState.y - 0.6, -9 + (boost ? -1.2 : brake ? 1.4 : 0) * 0.5);
    ship.update(dt, t, camera);
    look.setFocus(ship.group.position);
    // camera: lag behind ship, subtle sway, FOV kick on boost
    camera.position.x += (camBase.x + shipState.x * 0.35 - camera.position.x) * Math.min(1, dt * 3);
    camera.position.y += (camBase.y + shipState.y * 0.25 - camera.position.y) * Math.min(1, dt * 3);
    lookAt.set(shipState.x * 0.6, -0.2 + shipState.y * 0.4, -20);
    camera.lookAt(lookAt);
    camera.rotation.z += -ax * 0.06;
    const tf = boost ? 66 : brake ? 54 : 58;
    camera.fov += (tf - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
    // streaks
    streakAmt += ((boost ? 1 : 0) - streakAmt) * Math.min(1, dt * 5);
    streakMat.opacity = streakAmt * 0.7;
    if (streakAmt > 0.01) {
      const spd = 90 * streakAmt + 10;
      for (let i = 0; i < NS; i++) {
        const s = sSeed[i]; s.z += spd * dt; if (s.z > 10) s.z -= 90;
        const z = s.z - 70; const len = 2 + 10 * streakAmt;
        sPos.set([s.x, s.y, z, s.x, s.y, z + len], i * 6);
      }
      streakGeo.attributes.position.needsUpdate = true;
    }
    // enemies weave far ahead
    enemies.forEach((e, i) => {
      const p = e.userData.phase + t * 0.5;
      e.position.set(Math.sin(p) * e.userData.rad, Math.cos(p * 1.3) * 3 + 1.0, -40 - Math.sin(p * 0.7 + i) * 10);
      e.lookAt(e.position.x + Math.cos(p) * 2, e.position.y, e.position.z - 4);
      e.rotation.z += Math.sin(p) * 0.5;
    });
    // bolts
    fireCd -= dt;
    if (input?.isHeld('fire') && fireCd <= 0) { fire(); fireCd = 0.14; }
    for (const m of bolts) {
      if (!m.visible) continue;
      m.userData.life += dt; m.position.addScaledVector(m.userData.dir, 110 * dt);
      if (m.userData.life > 0.7) m.visible = false;
    }
  }

  function dispose() {
    scene.remove(group);
    ship.dispose();
    planet.traverse?.((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    for (const d of disposables) d.traverse?.((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
    look.dispose();
  }
  return { update, dispose, ship, enemies, look };
}
