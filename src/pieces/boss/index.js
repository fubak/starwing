// PIECE: boss — "GORGON", a Venomian dreadnought. Three phases (shield
// generators -> cannon power cells -> exposed reactor core), telegraphed laser
// sweeps & missile volleys, hex shield, escalating fires, chain-reaction
// slow-mo destruction. Autoplay script fights the whole encounter in ~40s.

import { buildSky } from './sky.js';
import { loadArwing } from './arwing.js';
import { buildBoss } from './bossModel.js';
import { Particles, Shards, Explosions, Beam, Missiles, Bolts, makeShield, makeTextures } from './fx.js';
import { buildHud } from './hud.js';

const BOSS_BASE_Z = -150;
const PLAYER_X = 34, PLAYER_Y_MIN = -16, PLAYER_Y_MAX = 18;

export async function create(ctx) {
  const { THREE, scene, camera, renderer, bloom, input, ui, audio, rng, size } = ctx;
  scene.background = new THREE.Color(0x05060f);
  bloom.strength = 0.85; bloom.radius = 0.55; bloom.threshold = 0.72;
  renderer.toneMappingExposure = 1.05;
  camera.fov = 58; camera.near = 0.5; camera.far = 9000; camera.updateProjectionMatrix();

  // ---------- lighting rig
  const sunDir = new THREE.Vector3(0.55, 0.62, 0.55).normalize();
  const sun = new THREE.DirectionalLight(0xffe4c4, 2.8); sun.position.copy(sunDir).multiplyScalar(600); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x5c8cff, 1.1); rim.position.set(-400, 120, -500); scene.add(rim);
  const fill = new THREE.HemisphereLight(0x6a58b8, 0x2c3a24, 0.55); scene.add(fill);
  const planetBounce = new THREE.DirectionalLight(0x9bd45a, 0.45); planetBounce.position.set(-500, -600, -300); scene.add(planetBounce);
  const sky = buildSky(THREE, scene, renderer, sunDir);

  // ---------- actors
  const boss = buildBoss(THREE, rng);
  boss.root.position.set(0, 0, BOSS_BASE_Z);
  scene.add(boss.root);
  const shield = makeShield(THREE); boss.root.add(shield); shield.position.set(0, 2, -4);
  const ship = await loadArwing(THREE);
  scene.add(ship);
  const shipInner = ship.children[0];

  // weak-point lights (one per active phase-point, max 4)
  const wpLights = Array.from({ length: 4 }, () => { const l = new THREE.PointLight(0xffb347, 0, 90, 1.8); scene.add(l); return l; });
  const coreLight = new THREE.PointLight(0xff3020, 0, 160, 1.6); scene.add(coreLight);
  const engineLight = new THREE.PointLight(0x4fa8ff, 400, 220, 1.5); boss.root.add(engineLight); engineLight.position.set(0, 0, -90);
  const shipLight = new THREE.PointLight(0x66c8ff, 60, 30, 1.6); ship.add(shipLight); shipLight.position.set(0, 0, 4);

  // ---------- fx
  const tex = makeTextures(THREE, rng);
  const smoke = new Particles(THREE, { max: 2600, texture: tex.smoke, blending: THREE.NormalBlending, sizeAtten: 1 });
  const fire = new Particles(THREE, { max: 1400, texture: tex.soft, blending: THREE.AdditiveBlending, sizeAtten: 1 });
  const sparks = new Particles(THREE, { max: 1200, texture: tex.hard, blending: THREE.AdditiveBlending, sizeAtten: 0.5 });
  scene.add(smoke.points, fire.points, sparks.points);
  fire.points.renderOrder = 3; smoke.points.renderOrder = 2; sparks.points.renderOrder = 4;
  const shards = new Shards(THREE, 200); scene.add(shards.mesh);
  const explosions = new Explosions(THREE, scene, 16);
  const beams = [new Beam(THREE, scene, 0xff4a2a), new Beam(THREE, scene, 0xff4a2a)];
  const missiles = new Missiles(THREE, scene, smoke, explosions, 16);
  const bolts = new Bolts(THREE, scene, 30);
  const hud = buildHud(ui);

  // ---------- state
  const S = {
    ft: 0, timeScale: 1, phase: 0, intro: true,
    player: { pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(), bank: 0, pitch: 0, roll: 0, rollDir: 1, shield: 1, hurt: 0, fireCd: 0, side: 1 },
    hits: 0, shake: 0, flash: 0,
    attack: { nextLaser: 6.5, nextVolley: 0, laserIdx: 0 },
    hatchOpen: 0, hatchTimer: 0, volleyQueue: [],
    transition: null, destruct: null, iris: 0, lunge: 0,
    cam: { mode: 'chase', t: 0, pos: new THREE.Vector3(0, 6, 22), look: new THREE.Vector3(0, 0, -60), cut: true },
    fires: [], fireAcc: 0, sparkAcc: 0,
  };
  const V = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3() };

  const activePoints = () => boss.weakPoints.filter((w) => w.alive && w.phase === S.phase);
  const worldPos = (obj, out) => { obj.updateWorldMatrix(true, false); return out.setFromMatrixPosition(obj.matrixWorld); };
  const bossHealth = () => { let f = 0; for (const p of [1, 2, 3]) { const ws = boss.weakPoints.filter((w) => w.phase === p); f += ws.reduce((a, w) => a + w.hp, 0) / ws.reduce((a, w) => a + w.maxHp, 0); } return f / 3; };

  const sfx = {
    laser: () => audio.tone({ type: 'square', f0: 1400, f1: 500, dur: 0.09, gain: 0.08 }),
    hit: () => audio.tone({ type: 'triangle', f0: 800, f1: 300, dur: 0.06, gain: 0.05 }),
    boom: (g = 0.4) => { audio.noise({ dur: 1.2, gain: g, cutoff: 500 }); audio.tone({ type: 'sine', f0: 90, f1: 30, dur: 0.8, gain: g * 0.6 }); },
    warn: () => { audio.tone({ type: 'square', f0: 660, f1: 660, dur: 0.14, gain: 0.08 }); setTimeout(() => audio.tone({ type: 'square', f0: 660, f1: 660, dur: 0.14, gain: 0.08 }), 200); },
    beam: () => audio.noise({ dur: 1.6, gain: 0.25, cutoff: 2400, q: 2 }),
    shatter: () => { audio.noise({ dur: 0.6, gain: 0.35, cutoff: 3000 }); audio.tone({ type: 'sawtooth', f0: 300, f1: 60, dur: 0.5, gain: 0.2 }); },
  };

  // ---------- helpers: damage / shatter
  function damagePoint(w, dmg, at) {
    if (!w.alive) return;
    w.hp -= dmg; w.flash = 1; S.hits++;
    sparks.emit(at, V.a.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 20 + Math.random() * 30), { life: 0.35, size: 3, c0: [1.6, 2.4, 1.0], c1: [0.4, 1.0, 0.3] });
    for (let i = 0; i < 6; i++) sparks.emit(at, V.a.set((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 10 + Math.random() * 50), { life: 0.25 + Math.random() * 0.3, size: 1.2, drag: 3, c0: [2.0, 2.5, 1.4], c1: [0.5, 1.2, 0.3] });
    sfx.hit();
    if (w.hp <= 0) shatterPoint(w);
  }
  function shatterPoint(w) {
    w.alive = false; w.hp = 0; w.mesh.visible = false;
    const p = worldPos(w.mesh, new THREE.Vector3());
    explosions.spawn(p, w.phase === 3 ? 26 : 13, 1.2, w.phase === 3 ? [1.2, 0.9, 0.9] : null);
    shards.burst(p, w.phase === 3 ? 60 : 34, 40, w.radius * 0.45, { glow: 1, life: 2.6 });
    for (let i = 0; i < 40; i++) smoke.emit(p, V.a.set((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24), { life: 2.5 + Math.random() * 2, size: 5, grow: 3, drag: 1.2, c0: [0.5, 0.45, 0.4], c1: [0.12, 0.12, 0.14] });
    for (let i = 0; i < 30; i++) sparks.emit(p, V.a.set((Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90), { life: 0.6 + Math.random() * 0.6, size: 1.6, drag: 1.5, c0: [3, 2, 1], c1: [1, 0.3, 0.1] });
    S.shake = Math.max(S.shake, 0.8); S.flash = Math.max(S.flash, 0.25); sfx.shatter(); sfx.boom(0.4);
    // a fire takes hold where the component was
    S.fires.push({ local: boss.root.worldToLocal(p.clone()), size: 1.2, born: S.ft });
    const remaining = activePoints().length;
    if (remaining === 0) advancePhase();
    else hud.comm('PEPPY', w.phase === 1 ? `Generator down! ${remaining} to go, Fox!` : `Nice shot! Hit the other one!`);
  }

  function advancePhase() {
    if (S.phase === 1) { S.transition = { kind: 'shieldDown', t: 0 }; hud.warn('SHIELD DOWN'); sfx.warn(); hud.comm('SLIPPY', "Its shield is down! Go for the cannons!"); setCam('orbitFront', true); }
    else if (S.phase === 2) { S.transition = { kind: 'coreOpen', t: 0 }; hud.warn('CORE EXPOSED'); sfx.warn(); hud.comm('FALCO', 'There! Hit the core, Fox!'); setCam('orbitCore', true); }
    else if (S.phase === 3) { beginDestruction(); }
  }
  function setPhase(p) {
    S.phase = p; hud.setPhase(p);
    S.attack.nextLaser = S.ft + (p === 1 ? 1.2 : p === 2 ? 2.5 : 1.0);
    S.attack.nextVolley = S.ft + (p === 2 ? 0.8 : p === 3 ? 3.0 : 1e9);
  }
  function setCam(mode, cut = false) { S.cam.mode = mode; S.cam.t = 0; S.cam.cut = cut; }

  // ---------- attacks
  function startLaser(idx, style) {
    const beam = beams[idx]; if (beam.state !== 'idle') return;
    const em = boss.emitters[idx].mesh;
    const py = S.player.pos.y, px = S.player.pos.x;
    let pathFn;
    if (style === 'h') { const dir = idx === 0 ? 1 : -1; pathFn = (u) => new THREE.Vector3(-dir * 90 + dir * 180 * u, py + Math.sin(u * 3) * 3, 0); }
    else if (style === 'v') { pathFn = (u) => new THREE.Vector3(px, 40 - 80 * u, 0); }
    else { const dir = idx === 0 ? 1 : -1; pathFn = (u) => new THREE.Vector3(-dir * 80 + dir * 160 * u, 30 - 60 * u, 0); }
    beam.start(em, pathFn, S.phase === 3 ? 0.9 : 1.25, S.phase === 3 ? 1.5 : 1.7);
    beam.pathStyle = style; beam.pathY = py; beam.pathX = px;
    hud.warn('LASER SWEEP'); sfx.warn(); setTimeout(() => beam.firing && sfx.beam(), 1250);
  }
  function startVolley(count = 6) {
    S.hatchTimer = 0.9; hud.warn('MISSILES INCOMING');
    for (let i = 0; i < count; i++) S.volleyQueue.push(0.9 + i * 0.13);
  }

  // ---------- destruction
  function beginDestruction() {
    S.destruct = { t: 0, real: 0, nextChain: 0, final: false, chainIdx: 0 };
    for (const l of wpLights) l.intensity = 0;
    setCam('destruct', true); hud.hideTop(true); hud.comm('PEPPY', "You did it, Fox! Get out of there!", 6);
    for (const b of beams) if (b.state !== 'idle') { b.state = 'idle'; b.group.visible = false; b.hitLight.intensity = 0; }
  }
  const partInfo = {};
  for (const [name, g] of Object.entries(boss.parts)) {
    const box = new THREE.Box3().setFromObject(g); const c = box.getCenter(new THREE.Vector3());
    partInfo[name] = { c, drift: new THREE.Vector3(), vel: c.clone().normalize().multiplyScalar(6 + Math.random() * 6).add(new THREE.Vector3(0, 0, 8)), rot: new THREE.Quaternion(), av: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5) };
  }
  function resetFight() {
    S.destruct = null; S.transition = null; S.phase = 0; S.intro = true; S.ft = 0; S.timeScale = 1; S.fires = []; S.iris = 0; S.lunge = 0; S.hits = 0;
    for (const w of boss.weakPoints) { w.alive = true; w.hp = w.maxHp; w.mesh.visible = true; }
    for (const [name, g] of Object.entries(boss.parts)) { g.position.set(0, 0, 0); g.quaternion.identity(); g.visible = true; partInfo[name].drift.set(0, 0, 0); partInfo[name].rot.identity(); }
    shield.visible = true; shield.material.uniforms.uDissolve.value = 0; shield.material.uniforms.uPower.value = 1;
    boss.engineGlowMat.uniforms.uPower.value = 1; engineLight.intensity = 400;
    for (const h of boss.hatches) { h.lid.rotation.z = 0; h.glow.opacity = 0; }
    hud.hideTop(false); hud.win(false); hud.setPhase(1);
    S.player.shield = 1; setCam('chase', true);
  }

  // ---------- autoplay script (reads live state so it always fights well)
  let scriptMem = { roll: 0, wasRolling: false };
  input.script = (t) => {
    const p = S.player; const buttons = [];
    let tx = 0, ty = 0;
    if (S.intro) { tx = Math.sin(S.ft * 0.8) * 14; ty = Math.sin(S.ft * 0.5) * 4; }
    else {
      const pts = activePoints();
      let target = null, best = 1e9;
      for (const w of pts) { const wp = worldPos(w.mesh, V.a); const d = Math.hypot(wp.x * 0.32 - p.pos.x, wp.y * 0.32 - p.pos.y); if (d < best) { best = d; target = wp.clone(); } }
      if (target) { tx = THREE.MathUtils.clamp(target.x * 0.32, -PLAYER_X, PLAYER_X); ty = THREE.MathUtils.clamp(target.y * 0.32 + 2, PLAYER_Y_MIN + 2, PLAYER_Y_MAX - 2); }
      // dodge: laser sweeps
      for (const b of beams) {
        if (b.state === 'idle') continue;
        if (b.pathStyle === 'h') ty = b.pathY > p.pos.y - 2 ? Math.max(PLAYER_Y_MIN + 2, b.pathY - 14) : Math.min(PLAYER_Y_MAX - 2, b.pathY + 14);
        else if (b.pathStyle === 'v') tx = b.pathX > p.pos.x ? Math.max(-PLAYER_X, b.pathX - 22) : Math.min(PLAYER_X, b.pathX + 22);
        else { ty = Math.min(PLAYER_Y_MAX - 2, Math.max(ty, 8)); tx = -Math.sign(b.to.x || 1) * 24; }
      }
      // dodge: missiles close -> barrel roll
      let near = 0; for (const m of missiles.pool) if (m.active && m.g.position.distanceTo(p.pos) < 26) near++;
      if (near > 0 && p.roll <= 0 && scriptMem.roll <= 0) { scriptMem.roll = 0.9; scriptMem.dir = Math.sign(Math.sin(t * 3)) || 1; }
      if (scriptMem.roll > 0) { buttons.push(scriptMem.dir > 0 ? 'rollR' : 'rollL'); tx += scriptMem.dir * 10; }
      if (S.timeScale > 0.5 && !S.destruct && (Math.floor(t * 10) % 10) < 8) buttons.push('fire');
      if (S.destruct) { tx = Math.sin(t * 0.7) * 10; ty = 6; }
    }
    const x = THREE.MathUtils.clamp((tx - p.pos.x) * 0.18, -1, 1), y = THREE.MathUtils.clamp((ty - p.pos.y) * 0.22, -1, 1);
    return { x, y, buttons };
  };

  // ---------- intro
  hud.comm('ROB 64', 'Enemy dreadnought detected. Codename: GORGON.', 4);
  setCam('intro', true);
  hud.setPhase(1);

  // ======================================================================
  function update(dt, t) {
    const real = Math.min(dt, 0.05);
    // slow-mo
    const ts = S.destruct ? (S.destruct.real < 3.4 ? 0.12 : 1) : 1;
    S.timeScale += (ts - S.timeScale) * Math.min(1, real * (ts < S.timeScale ? 10 : 5));
    S.realT = t;
    const dtS = real * S.timeScale;
    S.ft += dtS;
    hud.update(real);
    scriptMem.roll -= real;

    // ---- intro -> phase 1
    if (S.intro && S.ft > 4.2) { S.intro = false; setPhase(1); setCam('chase', false); hud.warn('ENGAGE'); hud.comm('PEPPY', 'Take out the shield generators on the wings!', 3.5); }

    // ---- player
    const P = S.player;
    const ax = input.axes.x, ay = input.axes.y;
    const speed = 62;
    P.vel.x += ((ax * speed) - P.vel.x) * Math.min(1, dtS * 7);
    P.vel.y += ((ay * speed * 0.8) - P.vel.y) * Math.min(1, dtS * 7);
    P.pos.x = THREE.MathUtils.clamp(P.pos.x + P.vel.x * dtS, -PLAYER_X, PLAYER_X);
    P.pos.y = THREE.MathUtils.clamp(P.pos.y + P.vel.y * dtS, PLAYER_Y_MIN, PLAYER_Y_MAX);
    if (Math.abs(P.pos.x) >= PLAYER_X) P.vel.x = 0; if (P.pos.y <= PLAYER_Y_MIN || P.pos.y >= PLAYER_Y_MAX) P.vel.y = 0;
    P.bank += ((-ax * 0.9 - P.vel.x * 0.004) - P.bank) * Math.min(1, dtS * 5);
    P.pitch += ((ay * 0.35) - P.pitch) * Math.min(1, dtS * 5);
    if (P.roll <= 0 && (input.wasPressed('rollL') || input.wasPressed('rollR'))) { P.roll = 0.62; P.rollDir = input.wasPressed('rollL') ? 1 : -1; audio.tone({ type: 'sine', f0: 300, f1: 900, dur: 0.5, gain: 0.06 }); }
    let rollAngle = 0;
    if (P.roll > 0) { P.roll -= dtS; const u = 1 - Math.max(0, P.roll) / 0.62; rollAngle = P.rollDir * Math.PI * 2 * (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2); }
    ship.position.copy(P.pos);
    ship.rotation.set(P.pitch, P.vel.x * -0.004, P.bank + rollAngle);
    shipInner.position.y = Math.sin(S.ft * 2.3) * 0.15;
    // fire
    P.fireCd -= dtS;
    if (input.isHeld('fire') && P.fireCd <= 0 && !S.destruct) {
      P.fireCd = 0.11; P.side *= -1;
      const muzzle = V.a.set(P.side * 2.4, -0.3, -3.5).applyEuler(ship.rotation).add(P.pos);
      // soft auto-aim toward the current target within a cone
      const pts = activePoints(); let dir = V.b.set(0, 0, -1); let best = 1e9;
      for (const w of pts) { const wp = worldPos(w.mesh, V.c); const d = V.d.copy(wp).sub(muzzle); const ang = Math.acos(THREE.MathUtils.clamp(-d.z / d.length(), -1, 1)); const score = ang + Math.hypot(wp.x * 0.32 - P.pos.x, wp.y * 0.32 - P.pos.y) * 0.01; if (ang < 0.62 && score < best) { best = score; dir = d.clone().normalize(); } }
      bolts.fire(muzzle, dir, 300); sfx.laser();
    }
    // hurt / shield regen
    P.hurt = Math.max(0, P.hurt - real * 2);
    P.shield = Math.min(1, P.shield + dtS * 0.015);

    // ---- boss idle motion, lunge in phase 3
    const B = boss.root;
    const lungeTarget = S.phase === 3 || S.destruct ? 1 : 0;
    S.lunge += (lungeTarget - S.lunge) * Math.min(1, dtS * 1.6);
    B.position.set(Math.sin(S.ft * 0.31) * 3, Math.sin(S.ft * 0.47) * 2.2 + 1, BOSS_BASE_Z + S.lunge * 28 + (S.transition?.kind === 'coreOpen' ? -12 * Math.sin(Math.min(1, S.transition.t / 1.2) * Math.PI) : 0));
    B.rotation.set(Math.sin(S.ft * 0.2) * 0.012, 0, Math.sin(S.ft * 0.27) * 0.02);
    for (const head of boss.turrets) head.lookAt(P.pos);
    boss.engineGlowMat.uniforms.uTime.value = S.ft;
    boss.redLightMat.color.setScalar(0.6 + 0.4 * (Math.sin(S.ft * 4) > 0.3 ? 1 : 0)).multiply(new THREE.Color(1, 0.18, 0.1));
    // iris
    const irisTarget = S.phase === 3 || S.destruct ? 1 : 0;
    S.iris += (irisTarget - S.iris) * Math.min(1, dtS * 3.5);
    const irisEase = S.iris < 0.5 ? 4 * S.iris ** 3 : 1 - Math.pow(-2 * S.iris + 2, 3) / 2;
    for (const h of boss.petals) h.rotation.y = -irisEase * 1.45;
    // weak points shader / lights
    let li = 0;
    for (const w of boss.weakPoints) {
      w.flash = Math.max(0, w.flash - real * 6);
      w.mat.uniforms.uTime.value = S.ft; w.mat.uniforms.uFlash.value = w.flash * 0.8; w.mat.uniforms.uHeat.value = 1 - w.hp / w.maxHp;
      if (w.alive && w.phase === S.phase && w.phase !== 3 && li < 4) { const l = wpLights[li++]; worldPos(w.mesh, l.position); l.intensity = 350 * (0.8 + 0.2 * Math.sin(S.ft * 5)) * (1 + w.flash * 3); }
    }
    for (; li < 4; li++) wpLights[li].intensity = 0;
    const core = boss.weakPoints.find((w) => w.phase === 3);
    worldPos(core.mesh, coreLight.position); coreLight.position.z += 6;
    coreLight.intensity = core.alive ? 900 * irisEase * (0.85 + 0.15 * Math.sin(S.ft * 7)) : 0;

    // ---- shield
    const sh = shield.material.uniforms;
    sh.uTime.value = S.ft;
    if (S.transition?.kind === 'shieldDown') { const u = S.transition.t / 1.6; sh.uDissolve.value = Math.min(1, u); sh.uPower.value = 1 + (1 - u) * 1.5; }
    if (S.phase >= 2 && !S.transition) shield.visible = false;

    // ---- transitions
    if (S.transition) {
      S.transition.t += dtS;
      const T = S.transition;
      if (T.kind === 'shieldDown') {
        if (T.t < 1.4 && Math.random() < 0.5) { const p = V.a.set((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 160).add(B.position); sparks.emit(p, V.b.set(0, -20, 10), { life: 0.8, size: 2.2, c0: [0.6, 1.6, 2.6], c1: [0.2, 0.5, 1.0] }); }
        if (T.t > 2.6) { S.transition = null; shield.visible = false; setPhase(2); setCam('chase', true); }
      } else if (T.kind === 'coreOpen') {
        if (T.t > 0.9 && !T.boomed) { T.boomed = true; const p = worldPos(core.mesh, new THREE.Vector3()); explosions.spawn(p.clone().add(new THREE.Vector3(0, 0, 8)), 9, 0.8, [1.2, 0.5, 0.4]); sfx.boom(0.25); S.shake = 0.5; }
        if (T.t > 2.8) { S.transition = null; setPhase(3); setCam('chase', true); }
      }
    }

    // ---- attack scheduler
    const canAttack = S.phase >= 1 && !S.transition && !S.destruct && !S.intro;
    if (canAttack) {
      if (S.ft > S.attack.nextLaser) {
        const idx = S.attack.laserIdx++ % 2;
        const style = S.phase === 1 ? (S.attack.laserIdx % 3 === 0 ? 'v' : 'h') : S.phase === 2 ? (S.attack.laserIdx % 2 ? 'h' : 'd') : 'h';
        startLaser(idx, style);
        if (S.phase === 3) setTimeout(() => canAttack && S.phase === 3 && !S.destruct && startLaser(1 - idx, 'd'), 500);
        S.attack.nextLaser = S.ft + (S.phase === 1 ? 4.6 : S.phase === 2 ? 5.2 : 4.2);
      }
      if (S.ft > S.attack.nextVolley) { startVolley(S.phase === 3 ? 8 : 6); S.attack.nextVolley = S.ft + (S.phase === 2 ? 6.5 : 5.5); }
    }
    // hatches + volley launch
    S.hatchTimer -= dtS;
    const hatchTarget = S.hatchTimer > -1.2 && S.hatchTimer < 1.2 ? 1 : 0;
    S.hatchOpen += (hatchTarget - S.hatchOpen) * Math.min(1, dtS * 6);
    for (const h of boss.hatches) { h.lid.rotation.z = h.side * -S.hatchOpen * 1.9; h.glow.opacity = S.hatchOpen * (0.6 + 0.4 * Math.sin(S.ft * 20)); }
    if (S.volleyQueue.length) {
      for (let i = S.volleyQueue.length - 1; i >= 0; i--) {
        S.volleyQueue[i] -= dtS;
        if (S.volleyQueue[i] <= 0) {
          S.volleyQueue.splice(i, 1);
          const h = boss.hatches[Math.floor(Math.random() * boss.hatches.length)];
          const p = worldPos(h.group, new THREE.Vector3()); p.y += 1.5;
          missiles.launch(p, new THREE.Vector3((Math.random() - 0.5) * 0.6, 1, 0.15), P.pos, { life: 4.5 + Math.random(), speed: 34, turn: 1.6 });
          audio.tone({ type: 'sawtooth', f0: 200, f1: 900, dur: 0.3, gain: 0.05 });
        }
      }
    }
    // missiles vs player
    missiles.onDetonate = (m) => {
      const d = m.g.position.distanceTo(P.pos);
      if (d < 10 && P.roll <= 0) { P.shield -= 0.12; P.hurt = 1; S.shake = Math.max(S.shake, 0.7); S.flash = Math.max(S.flash, 0.15); }
    };
    // barrel roll deflects nearby missiles
    if (P.roll > 0) for (const m of missiles.pool) if (m.active && m.g.position.distanceTo(P.pos) < 9) { missiles.detonate(m); S.hits++; }
    // beams vs player
    for (const b of beams) {
      b.update(dtS, S.ft);
      if (b.firing) {
        const seg = V.a.copy(b.to).sub(b.from); const tt = THREE.MathUtils.clamp(V.b.copy(P.pos).sub(b.from).dot(seg) / seg.lengthSq(), 0, 1);
        const d = V.c.copy(b.from).addScaledVector(seg, tt).distanceTo(P.pos);
        if (d < 5) { P.shield -= dtS * 0.35; P.hurt = 1; S.shake = Math.max(S.shake, 0.5); }
        // beam impact sparks along the far end
        if (Math.random() < 0.7) sparks.emit(b.to, V.d.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 30 + Math.random() * 30), { life: 0.5, size: 2.5, drag: 2, c0: [2.5, 1.2, 0.6], c1: [1, 0.2, 0.1] });
      }
    }
    if (P.shield < 0) P.shield = 0;

    // ---- player bolts hit-testing
    const bossLocal = new THREE.Matrix4().copy(B.matrixWorld).invert();
    const hitTest = (prev, pos) => {
      for (const w of activePoints()) {
        const wp = worldPos(w.mesh, V.a);
        const seg = V.b.copy(pos).sub(prev); const tt = THREE.MathUtils.clamp(V.c.copy(wp).sub(prev).dot(seg) / Math.max(1e-6, seg.lengthSq()), 0, 1);
        if (V.d.copy(prev).addScaledVector(seg, tt).distanceTo(wp) < w.radius) { damagePoint(w, 10, V.d.clone()); return true; }
      }
      const lp = V.a.copy(pos).applyMatrix4(bossLocal);
      if (shield.visible && S.phase === 1) {
        const e = Math.hypot(lp.x / 118, (lp.y - 2) / 46, (lp.z + 4) / 96);
        if (e < 1) { const hits = sh.uHits.value; const slot = hits.reduce((bi, h, i, arr) => (h.w < arr[bi].w ? i : bi), 0); hits[slot].set(pos.x, pos.y, pos.z, S.ft); for (let i = 0; i < 5; i++) sparks.emit(pos, V.b.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 20 + Math.random() * 30), { life: 0.4, size: 1.5, drag: 2, c0: [0.8, 1.8, 2.6], c1: [0.2, 0.6, 1.2] }); return true; }
      }
      if (Math.abs(lp.x) < 100 && Math.abs(lp.y) < 26 && lp.z > -70 && lp.z < 74 && (Math.abs(lp.x) < 18 || Math.abs(lp.y) < 8)) {
        for (let i = 0; i < 6; i++) sparks.emit(pos, V.b.set((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, 20 + Math.random() * 40), { life: 0.35, size: 1.4, drag: 2, c0: [2.4, 2.0, 1.2], c1: [1.0, 0.4, 0.1] });
        return true;
      }
      return pos.z < -260;
    };
    bolts.update(dtS, hitTest);

    // ---- escalating damage: fires & smoke at anchors
    const dmg = 1 - bossHealth();
    const nFires = Math.min(boss.damageAnchors.length, Math.floor(dmg * 14));
    while (S.fires.length < nFires + Math.floor(dmg * 6)) { const a = boss.damageAnchors[S.fires.length % boss.damageAnchors.length]; S.fires.push({ local: a.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)), size: 0.7 + Math.random() * 0.6, born: S.ft }); }
    S.fireAcc += dtS * 60;
    while (S.fireAcc > 1) {
      S.fireAcc -= 1;
      for (const f of S.fires) {
        if (Math.random() > 0.55) continue;
        const wp = V.a.copy(f.local).applyMatrix4(B.matrixWorld);
        const grow = Math.min(1, (S.ft - f.born) / 1.5);
        fire.emit(wp, V.b.set((Math.random() - 0.5) * 6, 6 + Math.random() * 8, 4 + Math.random() * 8), { life: 0.45 + Math.random() * 0.4, size: 3.2 * f.size * grow, grow: -0.6, drag: 1, c0: [3.0, 1.6, 0.5], c1: [1.2, 0.25, 0.05] });
        if (Math.random() < 0.5) smoke.emit(wp, V.b.set((Math.random() - 0.5) * 5, 8 + Math.random() * 6, 6 + Math.random() * 6), { life: 2.2 + Math.random() * 2, size: 4 * f.size * grow, grow: 3.2, drag: 0.6, rise: 2, c0: [0.35, 0.3, 0.3], c1: [0.05, 0.05, 0.07] });
      }
    }
    if (S.destruct == null && dmg > 0.3 && Math.random() < dmg * 0.25) { const a = boss.damageAnchors[Math.floor(Math.random() * boss.damageAnchors.length)]; const wp = a.clone().applyMatrix4(B.matrixWorld); for (let i = 0; i < 4; i++) sparks.emit(wp, V.b.set((Math.random() - 0.5) * 30, Math.random() * 30, (Math.random() - 0.5) * 30), { life: 0.6, size: 1.2, drag: 1, c0: [3, 2.2, 1.2], c1: [1, 0.4, 0.1] }); }

    // ---- destruction sequence
    if (S.destruct) {
      const D = S.destruct; D.real += real; D.t += dtS;
      if (D.real > 0.1 && D.real < 3.3 && D.real > D.nextChain) {
        D.nextChain = D.real + 0.16;
        const a = boss.damageAnchors[D.chainIdx++ % boss.damageAnchors.length];
        const wp = a.clone().applyMatrix4(B.matrixWorld).add(new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 20));
        explosions.spawn(wp, 12 + Math.random() * 12, 2.4); shards.burst(wp, 14, 25, 1.6, { life: 4 }); sfx.boom(0.25); S.shake = Math.max(S.shake, 0.4);
        for (let i = 0; i < 20; i++) smoke.emit(wp, V.b.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30), { life: 5, size: 7, grow: 2.5, drag: 0.8, c0: [0.5, 0.4, 0.35], c1: [0.05, 0.05, 0.06] });
      }
      if (D.real >= 3.4 && !D.final) {
        D.final = true;
        const c = B.position.clone().add(new THREE.Vector3(0, 6, 10));
        explosions.spawn(c, 95, 2.6, [1.15, 1.05, 0.95]); explosions.spawn(c.clone().add(new THREE.Vector3(-50, 2, -10)), 55, 2.2); explosions.spawn(c.clone().add(new THREE.Vector3(55, 0, -10)), 55, 2.2);
        shards.burst(c, 120, 70, 4, { life: 6 }); S.flash = 1.6; S.shake = 2.2; sfx.boom(0.9);
        for (let i = 0; i < 400; i++) smoke.emit(c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 160, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 120)), V.b.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40), { life: 6 + Math.random() * 4, size: 14, grow: 2.5, drag: 0.5, c0: [0.8, 0.5, 0.35], c1: [0.04, 0.04, 0.05] });
        boss.engineGlowMat.uniforms.uPower.value = 0; engineLight.intensity = 0; coreLight.intensity = 0; S.fires = [];
        hud.hits(S.hits);
      }
      if (D.final) {
        for (const [name, g] of Object.entries(boss.parts)) {
          const pi = partInfo[name]; pi.drift.addScaledVector(pi.vel, dtS);
          const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(pi.av.x * dtS, pi.av.y * dtS, pi.av.z * dtS)); pi.rot.multiply(dq);
          g.quaternion.copy(pi.rot); g.position.copy(pi.drift).add(pi.c).sub(pi.c.clone().applyQuaternion(pi.rot));
          if (D.real > 4.2 && Math.random() < 0.08) { const wp = pi.c.clone().applyMatrix4(g.matrixWorld); fire.emit(wp, V.b.set((Math.random() - 0.5) * 6, 5, 4), { life: 0.6, size: 4, c0: [3, 1.5, 0.5], c1: [1, 0.2, 0.05] }); }
        }
        if (D.real > 4.8 && !D.won) { D.won = true; hud.win(true); audio.tone({ type: 'triangle', f0: 523, f1: 784, dur: 0.6, gain: 0.1 }); }
        if (D.real > 5.2) setCam('flyaway', false);
      }
      if (D.real > 12) resetFight();
    }

    // ---- fx systems
    smoke.update(dtS); fire.update(dtS); sparks.update(dtS); shards.update(dtS); explosions.update(dtS, camera); missiles.update(dtS, S.ft);
    for (const e of boss.engines) e.scale.setScalar(1 + Math.sin(S.ft * 30 + e.position.x) * 0.04);

    // ---- camera
    updateCamera(real, dtS);

    // ---- HUD
    hud.setHealth(bossHealth()); hud.shield(P.shield); hud.hits(S.hits);
    hud.flash(Math.min(1, S.flash * 0.9 + explosions.flash * 0.35 + P.hurt * 0.12)); S.flash *= Math.exp(-real * 4);
    hud.slowmo(S.timeScale < 0.6 ? 1 - S.timeScale : 0);
    {
      const pts = activePoints();
      if (pts.length && !S.destruct && !S.transition && !S.intro) {
        let bestW = null, best = 1e9; for (const w of pts) { const wp = worldPos(w.mesh, V.a); const d = Math.hypot(wp.x * 0.32 - P.pos.x, wp.y * 0.32 - P.pos.y); if (d < best) { best = d; bestW = w; } }
        const sp = worldPos(bestW.mesh, V.a).project(camera);
        hud.reticle((sp.x * 0.5 + 0.5) * size.x, (-sp.y * 0.5 + 0.5) * size.y, sp.z < 1, bestW.name);
      } else hud.reticle(0, 0, false);
    }
  }

  // ---------- camera director
  const camState = { pos: new THREE.Vector3(0, 10, 40), look: new THREE.Vector3(0, 0, -100), fov: 58 };
  function updateCamera(real, dtS) {
    const C = S.cam; C.t += real;
    const P = S.player; const B = boss.root;
    const wantPos = V.a, wantLook = V.b; let wantFov = 58; let stiff = 6;
    if (C.mode === 'intro') {
      // sweep along the dreadnought's flank toward the player
      const u = Math.min(1, C.t / 4.2); const e = 1 - Math.pow(1 - u, 3);
      wantPos.set(-150 + 150 * e, -30 + 42 * e, -60 + 90 * e); wantLook.set(-60 + 60 * e, 4, BOSS_BASE_Z + 20); wantFov = 50 + 8 * e; stiff = 40;
    } else if (C.mode === 'chase') {
      wantPos.set(P.pos.x * 0.55, P.pos.y * 0.55 + 5.5, 18 + P.vel.length() * 0.02); wantLook.set(P.pos.x * 0.6, P.pos.y * 0.6 + 1, -60); wantFov = 58 + (P.roll > 0 ? 3 : 0); stiff = 5.5;
    } else if (C.mode === 'orbitFront') {
      const a = -0.9 + C.t * 0.45; wantPos.set(Math.sin(a) * 120, 30 + C.t * 4, B.position.z + Math.cos(a) * 130); wantLook.copy(B.position).add(new THREE.Vector3(0, 6, 20)); wantFov = 52; stiff = 30;
    } else if (C.mode === 'orbitCore') {
      const a = 0.6 - C.t * 0.25; wantPos.set(Math.sin(a) * 40, 22 + C.t * 2, B.position.z + 44 + Math.cos(a) * 40); wantLook.copy(B.position).add(new THREE.Vector3(0, 15, 44)); wantFov = 46; stiff = 30;
    } else if (C.mode === 'destruct') {
      const a = 0.9 - C.t * 0.22; const r = 95 + C.t * 12; wantPos.set(Math.sin(a) * r, 26 + C.t * 5, B.position.z + 30 + Math.cos(a) * r); wantLook.copy(B.position).add(new THREE.Vector3(0, 8, 10)); wantFov = 50; stiff = 4;
    } else if (C.mode === 'flyaway') {
      wantPos.set(P.pos.x - 14, P.pos.y + 6 + C.t * 1.5, 18 + C.t * 4); wantLook.copy(B.position).add(new THREE.Vector3(0, 6, 0)); wantFov = 52; stiff = 3;
    }
    if (C.cut) { camState.pos.copy(wantPos); camState.look.copy(wantLook); camState.fov = wantFov; C.cut = false; }
    const k = Math.min(1, real * stiff);
    camState.pos.lerp(wantPos, k); camState.look.lerp(wantLook, k); camState.fov += (wantFov - camState.fov) * k;
    camera.position.copy(camState.pos);
    S.shake = Math.max(0, S.shake - real * 2.2);
    const sh = S.shake * S.shake * 0.9;
    const rt = S.realT || 0;
    camera.position.x += (Math.sin(rt * 91) + Math.sin(rt * 53)) * sh * 0.5; camera.position.y += (Math.sin(rt * 77) + Math.cos(rt * 41)) * sh * 0.5;
    camera.lookAt(camState.look);
    camera.rotation.z += P.bank * (C.mode === 'chase' ? 0.18 : 0) + Math.sin(rt * 67) * sh * 0.01;
    if (Math.abs(camera.fov - camState.fov) > 0.05) { camera.fov = camState.fov; camera.updateProjectionMatrix(); }
  }

  return {
    update,
    dispose() {
      input.script = null;
      hud.dispose(); sky.dispose();
      smoke.dispose(); fire.dispose(); sparks.dispose(); shards.dispose(); explosions.dispose(); for (const b of beams) b.dispose(); missiles.dispose(); bolts.dispose();
      scene.remove(boss.root, ship, smoke.points, fire.points, sparks.points, shards.mesh, sun, rim, fill, planetBounce, ...wpLights, coreLight);
      boss.root.traverse((o) => o.geometry?.dispose?.()); for (const m of boss.materials) m.dispose(); for (const t of boss.textures) t.dispose();
      for (const w of boss.weakPoints) w.mat.dispose(); shield.geometry.dispose(); shield.material.dispose();
      for (const t of Object.values(tex)) t.dispose();
      scene.background = null;
    },
  };
}
