// PIECE: hud — Star Fox style HUD (shield, boost/brake, hits/score, radar,
// comm window with animated procedural portrait, lock-on reticle, banners).
import * as THREE from 'three';
import { createHud } from './hud.js';
import { createBackdrop } from './backdrop.js';
export { createHud } from './hud.js';
export { createPortrait, CHARACTERS } from './portrait.js';

export async function create(ctx) {
  const { camera, input, size, scene } = ctx;
  scene.background = new THREE.Color(0x03060f);
  const backdrop = createBackdrop(ctx);
  const hud = createHud(ctx);

  // ---- scripted demo input (used by --autoplay)
  input.script = (t) => {
    const x = Math.sin(t * 0.9) * 0.8 + Math.sin(t * 2.3) * 0.2, y = Math.cos(t * 0.7) * 0.5;
    const buttons = [];
    const c = t % 20;
    if (c > 6 && c < 8.2) buttons.push('boost');
    if (c > 11 && c < 12.4) buttons.push('brake');
    if (c > 14.5 && c < 15.3) buttons.push('rollR');
    if (Math.floor(t * 4) % 3 === 0) buttons.push('fire');
    return { x, y, buttons };
  };

  // ---- showcase timeline (loops every 20s)
  const LOOP = 20;
  const events = [
    [0.4, () => hud.banner('GOOD LUCK', 'MISSION 1 · CORNERIA')],
    [1.2, () => hud.say('Peppy', "Fox, use the boost to get through!", { mood: 'calm' })],
    [4.6, () => { hud.addHit(1); hud.setLockTarget(0); }],
    [5.4, () => hud.addHit(1)],
    [6.0, () => hud.say('Falco', "Hey Einstein, I'm on your side!", { mood: 'alarm' })],
    [6.3, () => hud.addHit(2)],
    [7.2, () => hud.setLockTarget(null)],
    [8.6, () => { hud.damage(0.22); }],
    [9.3, () => { hud.damage(0.18); hud.say('Slippy', "Fox! Get this guy off me!", { mood: 'alarm' }); }],
    [10.2, () => hud.setLockTarget(2)],
    [11.6, () => hud.damage(0.3)],
    [12.4, () => hud.addHit(3)],
    [13.0, () => hud.setLockTarget(null)],
    [13.4, () => hud.say('Peppy', 'Do a barrel roll!', { mood: 'happy', speed: 0.05 })],
    [15.6, () => { hud.setShield(1); hud.addScore(500); }],
    [16.4, () => hud.say('Fox', "All aircraft report!", { mood: 'calm' })],
    [17.0, () => hud.setLockTarget(1)],
    [18.6, () => hud.setLockTarget(null)],
    [19.0, () => hud.banner('MISSION COMPLETE', 'HITS 32 · ALL WINGMEN OK', 1.6)],
  ];
  let loopIdx = 0, nextEvt = 0;

  // lock-on helper: track a 3D enemy and project to HUD space
  let lockTarget = null;
  hud.setLockTarget = (i) => { lockTarget = i == null ? null : backdrop.enemies[i]; if (!lockTarget) hud.setLock(null); };
  const v = new THREE.Vector3();

  // boost/brake energy model
  let boostE = 1, boostMode = 'idle';
  let radarT = 0;

  function update(dt, t) {
    backdrop.update(dt, t, input);
    // timeline
    const lt = t - loopIdx * LOOP;
    if (lt >= LOOP) { loopIdx++; nextEvt = 0; return update(0, t); }
    while (nextEvt < events.length && events[nextEvt][0] <= lt) { events[nextEvt][1](); nextEvt++; }

    // gauges
    const boosting = input.isHeld('boost'), braking = input.isHeld('brake');
    if ((boosting || braking) && boostE > 0.02) { boostE = Math.max(0, boostE - dt * 0.55); boostMode = boosting ? 'boost' : 'brake'; }
    else { boostE = Math.min(1, boostE + dt * 0.25); boostMode = 'idle'; }
    hud.setBoost(boostE, boostMode);
    hud.setAim(input.axes.x, input.axes.y);

    // lock projection
    if (lockTarget) {
      lockTarget.getWorldPosition(v); const d = v.distanceTo(camera.position); v.project(camera);
      hud.setLock({ x: (v.x * 0.5 + 0.5) * 1280, y: (-v.y * 0.5 + 0.5) * 720, dist: d * 12 });
    }
    // radar blips from enemy positions relative to ship
    radarT += dt;
    hud.setRadar(backdrop.enemies.map((e) => ({ x: Math.max(-1, Math.min(1, e.position.x / 16)), y: Math.max(-1, Math.min(1, (e.position.z + 20) / 30)), kind: 'enemy' }))
      .concat([{ x: Math.sin(radarT * 0.4) * 0.5, y: 0.35, kind: 'ally' }, { x: -0.55 + Math.cos(radarT * 0.3) * 0.15, y: 0.55, kind: 'ally' }, { x: 0.1, y: -0.85, kind: 'boss' }]));
    // firing pops a score tick occasionally
    if (input.wasPressed('fire') && Math.random() < 0.5) hud.addScore(10);
    hud.update(dt);
  }

  return {
    update,
    dispose() { hud.dispose(); backdrop.dispose(); input.script = null; },
  };
}
