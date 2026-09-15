/**
 * STAGE: rail mission over Corneria. Stitches world (terrain / sky / water),
 * ship (Arwing), enemies (waves + AI + bolts), vfx (lasers / explosions /
 * bomb / trails), hud (gauges, comm, banners), audio (music + sfx) under the
 * shared lookdev rig.  Rail feel ported from the flight piece (soft box,
 * bank-into-turn, barrel roll with i-frames, boost / brake with FOV kick,
 * chase camera that leads into turns and keeps the Arwing centre-low).
 *
 * Frame convention: the Arwing hovers near the origin looking down -Z; the
 * world scrolls toward +Z and is offset laterally so the rail follows the
 * river (keeps the camera clear of the city towers). Enemy paths are
 * authored relative to the origin, so they line up automatically.
 */
import * as THREE from 'three';
import { applyLook, PRESETS } from '../pieces/lookdev/index.js';
import { createWorld, beginWorld, SUN_DIR, FOG_DENSITY } from '../pieces/world/index.js';
import { buildArwing } from '../pieces/ship/index.js';
import { createEnemyManager } from '../pieces/enemies/index.js';
import { createVfx, PALETTE as VFX } from '../pieces/vfx/index.js';
import { parkedGpuWarm } from './warm.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
const rollCurve = (t) => { const c1 = 0.9, c2 = c1 * 1.525; return t < 0.5 ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2 : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2; };

const ALT = 46;                 // rail altitude above the terrain datum (scene y of the terrain group = -ALT)
const BOX = { x: 26, yMin: -14, yMax: 30 };
const CRUISE = 215;

// ---- mission script: [time, fn(api)]
function buildTimeline(api) {
  const { hud, em, say, banner, spawn, audio } = api;
  return [
    [0.6, () => banner('GOOD LUCK', 'MISSION 1 · CORNERIA')],
    [1.4, () => say('Peppy', "Fox, the Venomian vanguard is over the plains.\nStay sharp!", 'calm')],
    [3.0, () => spawn({ kind: 'v', craft: 'vulture', path: 'swoop', mirror: 1, startDist: 40 })],
    [5.2, () => say('Slippy', "I'm reading a whole squadron on radar!", 'alarm')],
    [7.5, () => spawn({ kind: 'snake', craft: 'hornet', path: 'weave', mirror: -1 })],
    [10.5, () => spawn({ kind: 'line', craft: 'vulture', path: 'dive', mirror: 1 })],
    [13.0, () => say('Peppy', "Use the boost to get through!", 'happy')],
    [15.5, () => spawn({ kind: 'v', craft: 'hornet', path: 'cross', mirror: -1 })],
    [18.0, () => spawn({ kind: 'circle', craft: 'mantis', path: 'loop', mirror: 1, speed: 70 })],
    [22.0, () => say('Falco', "Hey Einstein, I'm on your side!", 'alarm')],
    [24.5, () => spawn({ kind: 'snake', craft: 'vulture', path: 'strafe', mirror: 1 })],
    [27.0, () => spawn({ kind: 'line', craft: 'hornet', path: 'swoop', mirror: -1 })],
    [30.0, () => say('Peppy', "Do a barrel roll!", 'happy')],
    [31.5, () => spawn({ kind: 'v', craft: 'mantis', path: 'dive', mirror: -1, speed: 75 })],
    [35.0, () => spawn({ kind: 'snake', craft: 'hornet', path: 'weave', mirror: 1 })],
    [38.0, () => say('Slippy', "Fox! Get this guy off me!", 'alarm')],
    [39.5, () => spawn({ kind: 'circle', craft: 'vulture', path: 'cross', mirror: 1 })],
    [43.0, () => spawn({ kind: 'line', craft: 'mantis', path: 'strafe', mirror: -1, speed: 70 })],
    [46.0, () => say('Falco', "Thanks Fox, I thought they had me.", 'calm')],
    [48.5, () => spawn({ kind: 'v', craft: 'hornet', path: 'loop', mirror: 1 })],
    [52.0, () => spawn({ kind: 'snake', craft: 'vulture', path: 'dive', mirror: -1 })],
    [55.0, () => say('Peppy', "Try a somersault... no wait, that's later.\nKeep pushing!", 'calm')],
    [56.5, () => spawn({ kind: 'circle', craft: 'mantis', path: 'swoop', mirror: 1, speed: 72 })],
    [60.0, () => spawn({ kind: 'line', craft: 'hornet', path: 'cross', mirror: -1 })],
    [63.5, () => spawn({ kind: 'v', craft: 'vulture', path: 'weave', mirror: 1 })],
    [66.0, () => say('Slippy', "Something big is coming, Fox!\nEnergy readings off the scale!", 'alarm')],
    [67.5, () => spawn({ kind: 'snake', craft: 'mantis', path: 'strafe', mirror: -1, speed: 70 })],
    [70.5, () => spawn({ kind: 'circle', craft: 'hornet', path: 'loop', mirror: 1 })],
    [74.0, () => { banner('WARNING', 'ENEMY DREADNOUGHT APPROACHING', 3.0); audio?.sfx('alarm'); }],
    [75.5, () => say('Peppy', "That's the Gorgon! Target its shield generators,\nthen the cannons!", 'alarm')],
  ];
}

export async function createRail(ctx, game, hudMod) {
  const b = beginRail(ctx, game, hudMod);
  while (!b.done) b.step();
  return b.activate();
}

/**
 * Incremental rail-stage build for seamless intro -> rail.
 *
 * beginRail() returns { step(), done, remaining, activate(), abort() }. Each
 * step() builds one unit (the deferred look rig, the world prologue, one terrain
 * chunk at a time, the Arwing + hero lights, the enemy/vfx pools, the HUD) into
 * a parked, invisible Group, so construction spreads across the intro's frames.
 * Subsystems that `scene.add` internally (enemy pools, the vfx group) are swept
 * into the parked group after each step. activate() reparents everything into
 * the scene, installs the deferred look (lights / PMREM env / grade) + world
 * atmosphere, wires events, and returns the live { update, dispose } piece.
 */
export function beginRail(ctx, game, hudMod) {
  const { scene, camera, renderer, input, ui, rng, events, size } = ctx;
  const { audio, overlay } = game;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();

  // ---------- parked content: everything the build mounts lives under `stage`
  // (visible=false) until activate() reparents it, so a warm build during the
  // previous stage renders nothing and costs no draw calls.
  const stage = new THREE.Group(); stage.name = 'rail-warm'; stage.visible = false;
  // The parked group must be a CHILD of the live scene: parkedGpuWarm draws it
  // by toggling stage.visible around each unit's render() — a detached root is
  // never reached by projectObject, so the whole GPU warm would render an empty
  // scene and every program would still compile on the mount frame (measured:
  // prog +33 on stage:rail and +4 more mid-play at the first pool reveal).
  // visible=false keeps it parked: no draws, no light-census pollution, and
  // resetShared() may detach it — parkedGpuWarm.step() re-attaches if so.
  scene.add(stage);
  // Warm-built content must NEVER enter the live scene: a pooled light landing
  // under a visible parent changes the scene light census for one frame, which
  // recompiles every lit material mid-cinematic (the intro's compile storms).
  // buildCtx hands every builder the parked group as its "scene".
  const buildCtx = { ...ctx, scene: stage };
  const preOwned = new Set(scene.children);
  const sweep = () => { for (const o of scene.children.slice()) if (!preOwned.has(o)) { preOwned.add(o); stage.add(o); } };

  // ---------- state shared by the steps, activate(), update() and dispose()
  let look = null, wb = null, world = null, arwing = null;
  let shipRoot = null, shipAtt = null, shipRoll = null, player = null;
  let keyLight = null, rimLight = null, underLight = null, boostLight = null;
  let em = null, vfx = null, trail = null, wingL = null, wingR = null, hud = null;

  const STEP_NAMES = ['look', 'world-init', 'world', 'ship', 'enemies', 'enemy-pool', 'sweep', 'vfx', 'hud', 'look-mount', 'gpu-warm'];
  let pg = null;   // parked GPU warm (compile + first draw of every program, while parked)
  const S = {
    x: 0, y: 4, vx: 0, vy: 0, pitch: 0, yaw: 0, bank: 0,
    speed: CRUISE, boost: 0, brake: 0, gauge: 1,
    roll: { active: false, t: 0, dir: 1, cool: 0 }, tapL: -10, tapR: -10, prevX: 0,
    fireCool: 0, recoil: 0, fov: 60, shake: 0, invuln: 0,
    shield: 1, lives: 2, bombs: 3, dead: false, hits: 0, score: 0, shots: 0, hitsLanded: 0, kills: 0,
    time: 0, done: false, ending: false,
  };
  let railX = 0, railVX = 0, lockE = null, lockT = 0, zone = '', laserSfxT = 0;
  // charge shot (hold fire ~0.55s): plasma ball builds at the nose, paints the
  // locked target with a beam, and homes on release. lockProxy re-exposes the
  // enemy the ChargeShot is tracking (its contract wants { pos, radius, dead }).
  let chargeHold = 0;
  const lockProxy = { pos: new THREE.Vector3(), radius: 2.5, dead: true, enemy: null };
  const chargeMuzzle = { pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) };
  const camPos = new THREE.Vector3(0, 7, 12), camLook = new THREE.Vector3(0, 3, -60);
  const shipWorld = new THREE.Vector3(), aimDir = new THREE.Vector3(0, 0, -1), muzzleW = new THREE.Vector3();
  const offs = [];
  const radarBlips = [];
  let timeline = null, evt = 0;

  function hitTest(b) {
    if (b.owner === 'enemy') return false;
    for (const e of em.list) {
      if (e.state !== 'fly' || !e.group.visible) continue;
      if (b.pos.distanceToSquared(e.pos) < (e.radius + 1.2) ** 2) {
        tmp.copy(b.pos).sub(e.pos).normalize();
        tmp2.copy(e.pos).addScaledVector(tmp, e.radius * 0.85);
        vfx.hitSparks(tmp2, tmp, { color: b.color, scale: 1.4, count: 12 });
        em.damage(e, b.damage ?? 1, tmp2);
        audio?.sfx('hit');
        return true;
      }
    }
    // ground hit
    if (b.pos.y < world.heightAt(b.pos.x + railX, b.pos.z) - ALT) return true;
    return b.pos.z < -420;
  }

  // ---------- build steps (one unit each)
  const base = PRESETS.corneria;
  const steps = [
    // look: built detached (defer) — the PMREM env bake lands at install(), under the fade
    () => {
      look = applyLook(ctx, {
        ...base, name: 'corneria-mission',
        sun: { ...base.sun, dir: [SUN_DIR.x, SUN_DIR.y, SUN_DIR.z], color: 0xffd6a4, intensity: 3.9 },
        hemi: { sky: 0x7fb4ff, ground: 0x55684a, intensity: 0.65 },
        fill: { ...base.fill, color: 0x8fbaff, intensity: 0.22 },
        envIntensity: 0.5,
        fog: { color: 0xbcd4ea, density: FOG_DENSITY },
        exposure: 1.0,
        bloom: { strength: 0.42, radius: 0.6, threshold: 0.86 },
        grade: { ...base.grade, contrast: 1.07, saturation: 1.12, vignette: 0.28, lift: 0x02040a, gain: 0xfff6ec },
      }, { sky: false, shadowSize: 520, shadowMap: 2048, defer: true });
    },
    () => { wb = beginWorld(ctx, { look, defer: true }); world = wb.world; },
    () => (wb.step() ? undefined : 'again'), // one terrain-chunk/backdrop unit per step
    // ship (hero lights so the white hull never bleaches or sinks into the sky)
    () => {
      shipRoot = new THREE.Group(); shipAtt = new THREE.Group(); shipRoll = new THREE.Group();
      arwing = buildArwing({ THREE });
      arwing.setHover(0);
      const M = arwing.materials;
      for (const m of [M.matHull, M.matWing]) if (m) { m.color.set(0xdfe6ee); m.roughness = 0.42; m.envMapIntensity = 1.1; }
      if (M.matBlue) M.matBlue.color.set(0x1a4ee8);
      shipRoll.add(arwing.group); shipAtt.add(shipRoll); shipRoot.add(shipAtt); stage.add(shipRoot);
      keyLight = new THREE.DirectionalLight(0xffe2bc, 1.6); rimLight = new THREE.DirectionalLight(0x6fb4ff, 2.2); underLight = new THREE.DirectionalLight(0x6a9ab8, 0.7);
      stage.add(keyLight, keyLight.target, rimLight, rimLight.target, underLight, underLight.target);
      boostLight = new THREE.PointLight(0x5a9cff, 0, 26, 2); boostLight.position.set(0, 0, 6); arwing.rig.add(boostLight);
    },
    () => { player = new THREE.Object3D(); stage.add(player); em = createEnemyManager(buildCtx, player); sweep(); },
    // enemy craft pool: one craft (+ engine trails) per step — ConvexGeometry +
    // merged hulls are too heavy for a single frame, and mid-play they must
    // never be built at all (spawnWave borrows from the pool)
    () => (em.prewarmStep() ? undefined : 'again'),
    () => sweep(),
    () => {
      vfx = createVfx(buildCtx, { hitTest });
      vfx.setSun(SUN_DIR);
      trail = vfx.trail({ color: VFX.boost, hot: VFX.boostHot, width: 0.7, segments: 30, spacing: 0.035 });
      wingL = vfx.trail({ color: new THREE.Color(0.35, 0.8, 1.0), width: 0.16, segments: 22, spacing: 0.035 });
      wingR = vfx.trail({ color: new THREE.Color(0.35, 0.8, 1.0), width: 0.16, segments: 22, spacing: 0.035 });
      sweep();
    },
    // hud: DOM created hidden so a mid-intro warm never overlays the cinematic
    () => { hud = hudMod?.createHud ? hudMod.createHud(ctx) : null; if (hud) { hud.root.style.display = 'none'; game.hud = hud; } },
    // Mount the deferred look rig + world under the parked stage (the PMREM env
    // bake rides this step instead of the mount frame) so the GPU warm's light
    // census — every program cache key — matches the mounted stage.
    () => {
      stage.environment = look.mountTo(stage);
      stage.environmentIntensity = base.envIntensity ?? 0.5;
      // program keys only need the fog TYPE to match; world.install() writes the real one
      stage.fog = new THREE.FogExp2(0xbcd4ea, FOG_DENSITY);
      stage.add(world.group);
      pg = parkedGpuWarm(ctx, stage, {
        exposure: 1.0, shadowAuto: renderer.shadowMap.autoUpdate,
        bloom: ctx.bloom ? { s: 0.42, r: 0.6, t: 0.86 } : null,
        fov: 60, near: 0.5, far: 7000, zoom: 1,
        pos: camera.position.clone(), quat: camera.quaternion.clone(), up: camera.up.clone(),
      });
    },
    // compile + first draw of every rail program, a few drawables per unit
    () => (pg.step() ? undefined : 'again'),
  ];
  let stepI = 0;

  /** Mount the parked build and go live. Returns the piece (or null if no HUD). */
  function activate() {
    if (!hud) { abort(); return null; }
    for (const o of stage.children.slice()) scene.add(o);
    stage.removeFromParent();       // parked group is empty now — don't leave it mounted
    scene.add(world.group);
    world.group.position.set(0, -ALT, 0);
    look.install();                 // deferred rig goes live (lights / env / grade / fog / exposure)
    world.install();                // world's own fog + background (same as the synchronous path)
    scene.fog.density = FOG_DENSITY;
    camera.fov = 60; camera.near = 0.5; camera.far = 7000; camera.updateProjectionMatrix();
    camera.up.set(0, 1, 0);
    // A warm-built HUD is created while the PREVIOUS stage is still live; the
    // stage switch's resetShared() then strips every ui child it doesn't know —
    // detaching this root. Re-attach before unhiding (no-op on the sync path,
    // where the HUD is created after the reset).
    if (!hud.root.isConnected) ui.appendChild(hud.root);
    game.hud = hud; hud.root.style.display = '';

    // ---------- events
    offs.push(events.on('player:hit', ({ position }) => {
      if (S.invuln > 0 || S.ending) { vfx.hitSparks(position, tmp.set(0, 0, 1), { color: new THREE.Color(0.4, 0.8, 1), scale: 1.2 }); return; }
      S.shield = Math.max(0, S.shield - 0.07); hud.damage(0.07); S.shake = Math.max(S.shake, 0.7); vfx.shake(0.35); look.flash(0.12); S.invuln = 0.4;
      audio?.sfx('hurt');
      if (S.shield <= 0) {
        vfx.explode(shipWorld, S.lives > 0 ? 1.2 : 2.6, { flash: S.lives === 0 });
        audio?.sfx('explosionM'); look.flash(0.8); vfx.shake(1.0);
        if (S.lives <= 0) { // out of spares: the campaign shows GAME OVER and offers a retry
          S.shield = 0; hud.setShield(0); S.ending = true; S.dead = true; shipRoot.visible = false;
          hud.say('Peppy', 'Fox! FOX! ... Great Fox, we lost him.', { mood: 'alarm' });
          game.fail('ARWING DESTROYED OVER CORNERIA');
          return;
        }
        S.shield = 1; hud.setShield(1); S.lives = Math.max(0, S.lives - 1); hud.setLives(S.lives); S.invuln = 2.5;
        hud.say('Peppy', S.lives > 0 ? "Fox! Shields are gone — pulling a spare Arwing from Great Fox!" : "That's the last one, Fox. No more spares — stay alive!", { mood: 'alarm' });
      }
    }));
    offs.push(events.on('enemy:killed', ({ position, kind }) => {
      const pts = kind === 'mantis' ? 300 : kind === 'vulture' ? 150 : 100;
      S.kills++; S.score += pts; hud.addHit(1); hud.addScore(pts - 10);
      const d = position.distanceTo(camera.position);
      vfx.explode(position, kind === 'mantis' ? 2.2 : 1.5, { flash: d > 60, debrisTint: new THREE.Color(0.3, 0.26, 0.34) });
      audio?.sfx(kind === 'mantis' ? 'explosionM' : 'explosionS');
    }));
    offs.push(events.on('enemy:hit', () => { S.hitsLanded++; S.score += 10; hud.addScore(10); }));

    // ---------- helpers wired into the timeline
    const api = {
      hud, em, audio,
      say(who, text, mood) { hud.say(who, text, { mood }); audio?.sfx('comm'); },
      banner(a, b, d) { hud.banner(a, b, d); },
      spawn(o) {
        const w = em.spawnWave(o.kind, { ...o, mirror: o.mirror ?? rng.sign() });
        if (o.startDist) for (const e of em.list) if (e.wave === w) e.dist += o.startDist;
        return w;
      },
    };
    timeline = buildTimeline(api);
    evt = 0;

    hud.show(); hud.setLives(S.lives); hud.setBombs(S.bombs); hud.setShield(1);
    overlay.objective('OBJECTIVE', 'CLEAR THE CORNERIAN SKIES');
    overlay.hint('<b>WASD / MOUSE</b> FLY &nbsp; <b>SPACE / LMB</b> FIRE &nbsp; <b>SHIFT</b> BOOST &nbsp; <b>CTRL</b> BRAKE &nbsp; <b>Q/E</b> ROLL &nbsp; <b>B / RMB</b> BOMB', 9);
    input.mouse.steer = true;   // mouse aims the ship (click once for pointer lock)
    audio?.playMusic('main');

    // ---------- autoplay script (weave, boost + roll, brake, bomb)
    input.script = (t) => {
      const buttons = [];
      let x = Math.sin(t * 1.1) * 0.85 + Math.sin(t * 2.7) * 0.25, y = Math.sin(t * 0.8 + 1.0) * 0.5;
      const m = t % 16;
      if (m > 1.8 && m < 4.6) buttons.push('boost');
      if (m > 5.2 && m < 6.8) buttons.push('brake');
      if ((m > 3.7 && m < 3.9) || (m > 9.4 && m < 9.6)) buttons.push('rollR');
      if (m > 12.2 && m < 12.4) buttons.push('rollL');
      if (Math.floor(t * 2) % 3 !== 2) buttons.push('fire');
      if (t > 20 && t < 20.2 && Math.floor(t / 40) === 0) buttons.push('bomb');
      if (m > 9.8 && m < 11.6) { x = 1; y = -0.35; }
      if (m > 13.4 && m < 15) { x = -1; y = 0.55; buttons.push('boost'); }
      return { x, y, buttons };
    };
    return { update, dispose, state: S };
  }

  function update(dt, t) {
    dt = Math.min(dt, 1 / 20);
    S.time += dt;
    while (evt < timeline.length && timeline[evt][0] <= S.time) { timeline[evt][1](); evt++; }
    const ax = S.ending ? 0 : input.axes.x, ay = S.ending ? 0.15 : input.axes.y;

    // --- boost / brake
    const wantBoost = (input.isHeld('boost') && S.gauge > 0.02 && !S.ending) || S.ending;
    const wantBrake = input.isHeld('brake') && S.gauge > 0.02 && !S.ending;
    if (input.wasPressed('boost') && S.gauge > 0.02) audio?.sfx('boost');
    if (input.wasPressed('brake') && S.gauge > 0.02) audio?.sfx('brake');
    S.boost = damp(S.boost, wantBoost ? 1 : 0, wantBoost ? 6 : 3.5, dt);
    S.brake = damp(S.brake, wantBrake ? 1 : 0, wantBrake ? 7 : 4, dt);
    if ((wantBoost || wantBrake) && !S.ending) S.gauge = Math.max(0, S.gauge - dt * 0.45); else S.gauge = Math.min(1, S.gauge + dt * 0.25);
    S.speed = CRUISE * (1 + S.boost * 0.8 - S.brake * 0.5);
    hud.setBoost(S.gauge, S.boost > 0.3 ? 'boost' : S.brake > 0.3 ? 'brake' : 'idle');

    // --- barrel roll (Q/E or double tap)
    const R = S.roll; R.cool = Math.max(0, R.cool - dt);
    let rollReq = 0;
    if (input.wasPressed('rollL')) rollReq = -1;
    if (input.wasPressed('rollR')) rollReq = 1;
    if (ax > 0.6 && S.prevX <= 0.6) { if (S.time - S.tapR < 0.3) rollReq = 1; S.tapR = S.time; }
    if (ax < -0.6 && S.prevX >= -0.6) { if (S.time - S.tapL < 0.3) rollReq = -1; S.tapL = S.time; }
    S.prevX = ax;
    if (rollReq && !R.active && R.cool <= 0) { R.active = true; R.t = 0; R.dir = rollReq; S.invuln = 0.75; audio?.sfx('roll'); }
    if (R.active) { R.t += dt / 0.62; if (R.t >= 1) { R.active = false; R.t = 0; R.cool = 0.15; } }
    S.invuln = Math.max(0, S.invuln - dt);
    const rollAngle = R.active ? -R.dir * rollCurve(R.t) * Math.PI * 2 : 0;

    // --- steering in the soft box
    const agil = 1 - S.boost * 0.25 + S.brake * 0.3;
    S.vx = damp(S.vx, ax * 46 * agil, 5.5, dt);
    S.vy = damp(S.vy, ay * 34 * agil, 5.5, dt);
    S.x += S.vx * dt; S.y += S.vy * dt;
    if (S.x > BOX.x) { S.x = damp(S.x, BOX.x, 12, dt); S.vx *= 0.6; }
    if (S.x < -BOX.x) { S.x = damp(S.x, -BOX.x, 12, dt); S.vx *= 0.6; }
    if (S.y > BOX.yMax) { S.y = damp(S.y, BOX.yMax, 12, dt); S.vy *= 0.6; }
    if (S.y < BOX.yMin) { S.y = damp(S.y, BOX.yMin, 12, dt); S.vy *= 0.6; }
    // terrain floor (look ahead so the ship rises before ridges)
    let ground = -1e9;
    for (const z of [-40, -140, -260, -380]) ground = Math.max(ground, world.heightAt(S.x + railX, z) - ALT - (z < -300 ? 12 : 0));
    const minY = ground + 22;
    if (S.y < minY) { S.y = damp(S.y, minY, 7, dt); S.vy = Math.max(S.vy, 0); }

    // --- rail follows the river (world slides sideways under us)
    const targetRail = world.riverX(-300);
    railVX = damp(railVX, (targetRail - railX) * 0.9, 3, dt);
    railX += railVX * dt;
    world.group.position.x = -railX;

    // --- attitude
    S.yaw = damp(S.yaw, -S.vx * 0.012 - ax * 0.09, 8, dt);
    S.pitch = damp(S.pitch, S.vy * 0.014 + ay * 0.11, 8, dt);
    S.bank = damp(S.bank, -ax * 0.72 - S.vx * 0.005 - railVX * 0.004, 6.5, dt);
    S.recoil = Math.max(0, S.recoil - dt * 9);
    shipRoot.position.set(S.x, S.y, 0);
    shipAtt.rotation.set(S.pitch, S.yaw, S.bank, 'YXZ');
    shipRoll.rotation.z = rollAngle;
    shipRoll.position.z = S.recoil * 0.5 + S.brake * 1.2 - S.boost * 1.5;
    arwing.setBank(ax * 0.35); arwing.flap(-ay * 0.6 + S.brake * 0.8); arwing.setThrust(clamp(0.5 + S.boost * 0.5 - S.brake * 0.4, 0, 1));
    arwing.update(dt, t, camera);
    shipRoot.getWorldPosition(shipWorld); player.position.copy(shipWorld);
    aimDir.set(0, 0, -1).applyEuler(shipAtt.rotation).normalize();

    // --- lock-on: nearest live enemy in a forward cone
    let best = null, bestScore = 1e9;
    for (const e of em.list) {
      if (e.state !== 'fly' || !e.group.visible) continue;
      tmp.copy(e.pos).sub(shipWorld); const d = tmp.length(); if (d < 25 || d > 330) continue;
      const cos = tmp.divideScalar(d).dot(aimDir); if (cos < 0.93) continue;
      const sc = d * (1.6 - cos); if (sc < bestScore) { bestScore = sc; best = e; }
    }
    if (best !== lockE) { lockE = best; lockT = 0; if (best) audio?.sfx('lockon'); }
    if (lockE) {
      lockT += dt;
      tmp.copy(lockE.pos); const dist = tmp.distanceTo(shipWorld); tmp.project(camera);
      if (tmp.z < 1) hud.setLock({ x: (tmp.x * 0.5 + 0.5) * 1280, y: (-tmp.y * 0.5 + 0.5) * 720, dist: Math.round(dist) }); else hud.setLock(null);
    } else hud.setLock(null);
    hud.setAim(ax * 0.7 + S.yaw * -1.5, ay * 0.55 + S.pitch * 1.2);

    // --- fire: tap = twin laser stream; hold ~0.55s+ charges a homing plasma ball
    S.fireCool -= dt;
    const fireHeld = input.isHeld('fire') && !S.ending && !S.dead;
    const charge = vfx.charge;
    if (fireHeld) {
      chargeHold += dt;
      if (chargeHold > 0.55 && charge.state === 'idle') { charge.begin(() => chargeMuzzle); audio?.sfx('charge'); }
    } else {
      chargeHold = 0;
      if (charge.state === 'charging') {
        charge.release((tgt, pos) => {
          const e = tgt && tgt.enemy;
          if (e && e.state === 'fly') em.damage(e, 6, pos);
          audio?.sfx('charged'); vfx.shake(0.4); look.flash(0.15);
        });
      }
    }
    if (charge.state === 'charging') {
      chargeMuzzle.pos.copy(shipWorld).addScaledVector(aimDir, 1.6);
      chargeMuzzle.dir.copy(aimDir);
      if (lockE && lockE.state === 'fly') {
        lockProxy.pos.copy(lockE.pos); lockProxy.radius = Math.max(2, lockE.radius ?? 2);
        lockProxy.dead = lockE.state !== 'fly'; lockProxy.enemy = lockE; charge.lock(lockProxy);
      } else charge.lock(null);
    }
    if (fireHeld && S.fireCool <= 0 && charge.state === 'idle') {
      S.fireCool = 0.13; S.recoil = 1; S.shake = Math.max(S.shake, 0.15); S.shots += 2;
      arwing.rig.updateWorldMatrix(true, false);
      // aim assist: lead the locked target if the reticle is near it
      const target = lockE && lockT > 0.15 ? tmp3.copy(lockE.pos).addScaledVector(lockE.fwd, lockE.speed * (lockE.pos.distanceTo(shipWorld) / 440) * 0.9) : tmp3.copy(shipWorld).addScaledVector(aimDir, 160);
      for (const mp of arwing.muzzles) {
        muzzleW.copy(mp).applyMatrix4(arwing.rig.matrixWorld);
        tmp2.copy(target).sub(muzzleW).normalize();
        // scale 1.25 made a 0.09 m core: ~1 px at 120 m, and the bolts recede
        // from the chase camera so the axial streak buys nothing on screen.
        // Chunky Star Fox bolts need cross-section, not length.
        vfx.laser(muzzleW, tmp2, { speed: 440, life: 1.1, scale: 2.0, stretch: 2.4, owner: 'player', damage: 1 });
      }
      laserSfxT -= 1; if (laserSfxT <= 0) { audio?.sfx('laser'); laserSfxT = 1; }
    }
    // --- bomb
    if (input.wasPressed('bomb') && S.bombs > 0 && !vfx.bombRadius && !S.ending) {
      S.bombs--; hud.setBombs(S.bombs);
      tmp.copy(shipWorld).addScaledVector(aimDir, 110);
      vfx.bomb(tmp, { radius: 70, duration: 2.2 });
      audio?.sfx('explosionL'); look.flash(0.35); S.shake = 1.2;
      hud.say('Slippy', 'Nova bomb away!', { mood: 'happy', hold: 1.4 });
    }
    if (vfx.bombRadius > 0) for (const e of em.list) if (e.state === 'fly' && e.group.visible && e.pos.distanceTo(vfx.bombCenter) < vfx.bombRadius) { em.kill(e); break; }

    // --- systems
    em.update(dt, t);
    vfx.update(dt, camera);
    world.update(dt * vfx.timeScale, S.speed);
    look.update(dt, t);
    // hero lights ride with the ship
    keyLight.target.position.copy(shipWorld); keyLight.position.copy(shipWorld).add(tmp.set(-22, 30, 34));
    rimLight.target.position.copy(shipWorld); rimLight.position.copy(shipWorld).add(tmp.set(14, -4, -40));
    underLight.target.position.copy(shipWorld); underLight.position.copy(shipWorld).add(tmp.set(0, -30, 8));
    boostLight.intensity = S.boost * 30;
    // afterburner + wingtip ribbons
    const fwd = tmp2.set(0, 0, -1).applyQuaternion(arwing.rig.getWorldQuaternion(tmpQuat));
    trail.update(dt, arwing.rig.localToWorld(tmp.copy(arwing.nozzle)), fwd, S.boost);
    wingL.update(dt, arwing.rig.localToWorld(tmp.set(-2.75, -0.6, 1.3)), fwd, S.boost * 0.9 + Math.abs(S.bank) * 0.25);
    wingR.update(dt, arwing.rig.localToWorld(tmp.set(2.75, -0.6, 1.3)), fwd, S.boost * 0.9 + Math.abs(S.bank) * 0.25);

    // --- radar + zone card (blip objects are reused — no per-frame alloc)
    let nb = 0;
    for (const e of em.list) {
      if (e.state !== 'fly') continue;
      const b = radarBlips[nb] ?? (radarBlips[nb] = { x: 0, y: 0, kind: 'enemy' });
      b.x = clamp((e.pos.x - shipWorld.x) / 160, -1, 1); b.y = clamp(-(e.pos.z - 60) / 260, -1, 1); b.kind = e.kind === 'mantis' ? 'boss' : 'enemy';
      nb++;
    }
    radarBlips.length = nb; hud.setRadar(radarBlips);
    const zn = world.zoneName();
    if (zn !== zone) { if (zone) { overlay.caption('CORNERIA', zn.toUpperCase(), 'SECTOR ' + (zn === 'city' ? '2' : zn === 'canyon' ? '3' : zn === 'ocean' ? '4' : '1'), 2.4); } zone = zn; }

    // --- camera: chase, lags laterally, leads look into the turn; Arwing stays centre-low
    S.shake = Math.max(0, S.shake - dt * 3);
    const cz = 11.5 + S.brake * 2.2 - S.boost * 2.4, cy = 3.4 + S.brake * 1.4 - S.boost * 0.4;
    camPos.x = damp(camPos.x, S.x * 0.86, 6, dt);
    camPos.y = damp(camPos.y, S.y * 0.86 + cy, 6, dt);
    camPos.z = cz;
    camLook.x = damp(camLook.x, S.x * 0.92 + S.vx * 0.16 + ax * 2.0, 7, dt);
    camLook.y = damp(camLook.y, S.y * 0.94 + S.vy * 0.14 + ay * 1.2 - 1.2, 7, dt);
    camLook.z = -60;
    const shk = S.shake * 0.1 + S.boost * 0.05;
    camera.position.set(camPos.x + Math.sin(t * 61) * shk, camPos.y + Math.cos(t * 47) * shk, camPos.z);
    camera.up.set(0, 1, 0); camera.lookAt(camLook);
    camera.rotateZ(S.bank * 0.16);
    vfx.applyShake(camera);
    S.fov = damp(S.fov, 60 + S.boost * 14 - S.brake * 8, 5, dt);
    if (Math.abs(camera.fov - S.fov) > 0.01) { camera.fov = S.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    if (vfx.flashAmount > 0) look.flash(vfx.flashAmount * 0.6);

    hud.update(dt);
    // --- end of the rail leg: hand over to the boss
    if (S.time > 78 && !S.ending) { S.ending = true; overlay.objective('OBJECTIVE', 'ENGAGE THE DREADNOUGHT'); }
    if (S.time > 81.5 && !S.done && !S.dead) { S.done = true; game.next({ score: S.score, hits: S.kills, shots: S.shots, landed: S.hitsLanded }); }
  }

  function dispose() {
    for (const off of offs) off();
    input.script = null;
    input.mouse.steer = false;
    hud.setLock(null); hud.setRadar([]); hud.hideComm();
    trail.dispose?.(); wingL.dispose?.(); wingR.dispose?.();
    vfx.dispose(); em.dispose(); world.dispose(); look.dispose();
    scene.remove(world.group, shipRoot, player, keyLight, keyLight.target, rimLight, rimLight.target, underLight, underLight.target);
    arwing.dispose();
    scene.fog = null;
    camera.fov = 60; camera.updateProjectionMatrix();
    if (typeof window !== 'undefined') delete window.__world;
  }

  /** Tear down a partial build (the warm target changed mid-build). */
  function abort() {
    try { pg?.abort?.(); } catch {}
    stage.removeFromParent();       // it is a live scene child while parked
    for (const o of stage.children.slice()) stage.remove(o);
    try { hud?.dispose(); } catch {}
    try { trail?.dispose?.(); wingL?.dispose?.(); wingR?.dispose?.(); } catch {}
    try { vfx?.dispose(); } catch {}
    try { em?.dispose(); } catch {}
    try { arwing?.dispose(); } catch {}
    try { wb?.world.dispose(); } catch {}
    try { look?.dispose(); } catch {}
    stage.clear();
    if (game.hud === hud) game.hud = null;
  }

  return {
    get done() { return stepI >= steps.length; },
    get remaining() { return Math.max(0, steps.length - stepI); },
    get stepName() { const n = STEP_NAMES[Math.min(stepI, STEP_NAMES.length - 1)] ?? '?'; return stepI === 2 && wb ? `world:${wb.stepName}` : n; },
    /** Build one unit; 'again' steps (world chunks) repeat until that unit finishes. */
    step() { if (stepI >= steps.length) return true; if (steps[stepI]() !== 'again') stepI++; return this.done; },
    activate, abort,
    gwarmed: true,   // the GPU warm rides the step list — no warm pass needed at mount
  };
}
