/**
 * Enemy manager: waves of Venomian fighters flying spline paths in
 * formation (V / snake / circle / line), firing at the player, taking
 * damage (flash + punch), dying (spin-out + smoke -> explosion).
 *
 *   const em = createEnemyManager(ctx, playerRef);
 *   em.update(dt, t); em.spawnWave('v'); em.list; em.playerFire(origin, target)
 *
 * playerRef: { position: Vector3 } (any Object3D works).
 * Events emitted on ctx.events: 'enemy:spawn', 'enemy:hit', 'enemy:killed', 'player:hit'
 */
import * as THREE from 'three';
import { buildEnemyCraft, disposeCraft, CRAFT_KINDS } from './craft.js';
import { BoltPool, ExplosionPool, SpritePool } from './fx.js';

const UP = new THREE.Vector3(0, 1, 0);
const _t = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export const FORMATIONS = ['v', 'snake', 'circle', 'line'];

// ---- path templates (relative to player; player looks down -Z). x mirrored randomly.
const PATHS = {
  swoop: [[130, 70, -460], [40, 30, -260], [-25, 6, -110], [-30, -6, 20], [-10, -14, 140]],
  cross: [[-240, 40, -380], [-60, 22, -220], [70, 8, -120], [190, -6, -30], [320, -14, 60]],
  dive: [[60, 220, -420], [25, 90, -240], [-15, 20, -120], [-35, -2, -20], [-45, -10, 120]],
  strafe: [[26, -6, 60], [14, 4, -60], [-12, 14, -220], [-40, 40, -420], [-60, 70, -640]],
  weave: [[-120, 20, -480], [40, 30, -320], [-40, 5, -180], [30, 12, -80], [-20, 0, 30], [-40, -8, 140]],
  loop: [[0, 30, -420], [0, 20, -260], [0, 10, -170], [0, 70, -170], [0, 90, -230], [0, 30, -260], [0, -5, -130], [20, -10, 40], [40, -14, 130]],
};

function makePath(name, mirror, rng) {
  const jx = rng.range(-15, 15), jy = rng.range(-6, 6);
  const pts = PATHS[name].map(([x, y, z]) => new THREE.Vector3((x + jx) * mirror, y + jy, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  curve.arcLengthDivisions = 400;
  return { curve, length: curve.getLength(), name };
}

/** Formation offset (in path frame: x=right, y=up, z=along) + delay along path (world units). */
function formationSlot(kind, i, n, t) {
  switch (kind) {
    case 'v': { const k = Math.ceil(i / 2), side = i % 2 ? -1 : 1; return { off: new THREE.Vector3(side * 7 * k, -1.2 * k, 0), back: 6 * k }; }
    case 'line': return { off: new THREE.Vector3((i - (n - 1) / 2) * 8, 0, 0), back: 0 };
    case 'snake': return { off: new THREE.Vector3(0, 0, 0), back: 11 * i, wiggle: i };
    case 'circle': { return { off: new THREE.Vector3(0, 0, 0), back: 0, ring: (i / n) * Math.PI * 2 }; }
    default: return { off: new THREE.Vector3(0, 0, 0), back: 0 };
  }
}

export function createEnemyManager(ctx, playerRef, opts = {}) {
  const { scene, rng, events } = ctx;
  const list = [];           // alive + dying enemies
  const enemyBolts = new BoltPool(scene, { color: 0xff3a5c, core: 0xffd0d8, max: 64, length: 6, radius: 0.32 });
  const playerBolts = new BoltPool(scene, { color: 0x53ff7a, core: 0xeaffee, max: 40, length: 7, radius: 0.3 });
  const explosions = new ExplosionPool(scene, 8);
  const sprites = new SpritePool(scene, 160);
  let waveId = 0, time = 0;
  const stats = { spawned: 0, kills: 0, playerHits: 0 };

  function spawnWave(kind = rng.pick(FORMATIONS), o = {}) {
    if (!FORMATIONS.includes(kind)) kind = rng.pick(FORMATIONS);
    const craft = o.craft ?? rng.pick(CRAFT_KINDS);
    const pathName = o.path ?? rng.pick(Object.keys(PATHS));
    const mirror = o.mirror ?? rng.sign();
    const path = makePath(pathName, mirror, rng);
    const n = o.count ?? (kind === 'circle' ? 6 : kind === 'v' ? 5 : kind === 'snake' ? 6 : 4);
    const speed = (o.speed ?? rng.range(75, 105)) * (craft === 'mantis' ? 0.8 : craft === 'vulture' ? 1.15 : 1);
    waveId++;
    const wave = { id: waveId, kind, craft, path, n, speed, t0: time, ringR: craft === 'mantis' ? 12 : 8, ringW: rng.sign() * 1.6 };
    for (let i = 0; i < n; i++) {
      const g = buildEnemyCraft(craft);
      const slot = formationSlot(kind, i, n, time);
      const e = {
        group: g, kind: craft, wave, slot, hp: g.userData.hp, radius: g.userData.radius,
        dist: -slot.back - 2 * i, speed, state: 'fly', flash: 0, punch: 0, fireCd: rng.range(0.8, 2.4), age: 0, phase: rng.range(0, 6.28),
        vel: new THREE.Vector3(), spin: new THREE.Vector3(), dieT: 0, smokeCd: 0, pos: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1),
        scaleIn: 0,
      };
      g.visible = false;
      scene.add(g); list.push(e); stats.spawned++;
    }
    events?.emit('enemy:spawn', { wave: kind, craft, count: n });
    return wave;
  }

  function placeOnPath(e, dt) {
    const { curve, length } = e.wave.path;
    const u = e.dist / length;
    if (u >= 1) { remove(e); return; }
    if (u < 0) { e.group.visible = false; return; }
    e.group.visible = true;
    curve.getPointAt(u, _p); curve.getTangentAt(u, _t).normalize();
    _r.crossVectors(_t, UP).normalize(); _u.crossVectors(_r, _t).normalize();
    // banking from curvature (look-ahead tangent)
    const u2 = Math.min(u + 0.01, 1); curve.getTangentAt(u2, _a).normalize();
    const lateral = _a.sub(_t).dot(_r) / 0.01;                   // d(tangent)/du along right
    const bankTarget = THREE.MathUtils.clamp(-lateral * 0.55, -1.1, 1.1);
    e.bank = THREE.MathUtils.damp(e.bank ?? bankTarget, bankTarget, 6, dt);

    // formation offsets
    const s = e.slot; let ox = s.off.x, oy = s.off.y;
    if (s.wiggle !== undefined) { ox += Math.sin(e.dist * 0.05 + s.wiggle * 0.9) * 9; oy += Math.cos(e.dist * 0.05 + s.wiggle * 0.9) * 4; }
    if (s.ring !== undefined) { const a = s.ring + (time - e.wave.t0) * e.wave.ringW; ox += Math.cos(a) * e.wave.ringR; oy += Math.sin(a) * e.wave.ringR; }
    // idle bob
    oy += Math.sin(time * 2.1 + e.phase) * 0.35;
    _p.addScaledVector(_r, ox).addScaledVector(_u, oy);

    e.group.position.copy(_p); e.pos.copy(_p); e.fwd.copy(_t);
    _m.lookAt(_p, _b.copy(_p).add(_t), _u); _q.setFromRotationMatrix(_m);
    e.group.quaternion.copy(_q);
    e.group.rotateZ(e.bank + Math.sin(time * 1.7 + e.phase) * 0.04);
    if (s.ring !== undefined) e.group.rotateZ(Math.sign(e.wave.ringW) * 0.5); // lean into the orbit
    if (s.wiggle !== undefined) e.group.rotateZ(-Math.cos(e.dist * 0.05 + s.wiggle * 0.9) * 0.45);
  }

  function tryFire(e, dt) {
    if (!playerRef?.position) return;
    e.fireCd -= dt; if (e.fireCd > 0) return;
    _a.copy(playerRef.position).sub(e.pos); const d = _a.length(); _a.divideScalar(d);
    const facing = _a.dot(e.fwd);
    if (d < 45 || d > 420 || facing < 0.82) { e.fireCd = 0.25; return; }
    e.fireCd = rng.range(1.1, 2.6);
    // twin burst from the wing pods / mandibles
    const burst = e.kind === 'mantis' ? 3 : 2;
    for (let k = 0; k < burst; k++) {
      setTimeoutFrame(k * 0.09, () => {
        if (e.state !== 'fly') return;
        _b.copy(playerRef.position).sub(e.pos).normalize();
        _b.x += rng.range(-0.035, 0.035); _b.y += rng.range(-0.03, 0.03); _b.normalize();
        const side = (k % 2 ? -1 : 1) * 2.2;
        _a.set(side, -0.2, 2.5).applyQuaternion(e.group.quaternion).add(e.pos);
        enemyBolts.fire(_a, _b, 240, e);
        e.punch = Math.max(e.punch, 0.3); // recoil
      });
    }
  }

  // tiny frame-scheduler for bursts (deterministic w/ fixed step)
  const timers = [];
  function setTimeoutFrame(delay, fn) { timers.push({ t: delay, fn }); }
  function runTimers(dt) { for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } } }

  function damage(e, n = 1, hitPos = e.pos) {
    if (e.state !== 'fly') return false;
    e.hp -= n; e.flash = 1; e.punch = 1;
    for (let i = 0; i < 6; i++) sprites.emit({ p: hitPos, vel: new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).multiplyScalar(18), size: 0.9, grow: -0.6, dur: 0.35, color: 0xfff0a0, additive: true, opacity: 1 });
    events?.emit('enemy:hit', { enemy: e, position: hitPos.clone() });
    if (e.hp <= 0) kill(e);
    return true;
  }

  function kill(e) {
    e.state = 'dying'; e.dieT = 0; e.dieDur = rng.range(0.6, 1.1);
    e.vel.copy(e.fwd).multiplyScalar(e.speed * 0.55).add(new THREE.Vector3(rng.range(-10, 10), rng.range(-6, 2), rng.range(-10, 10)));
    e.spin.set(rng.range(-5, 5), rng.range(-3, 3), rng.range(-9, 9));
    explosions.spawn(e.pos, 0.45);
    stats.kills++;
    events?.emit('enemy:killed', { kind: e.kind, position: e.pos.clone(), wave: e.wave.kind });
  }

  function updateDying(e, dt) {
    e.dieT += dt;
    e.vel.y -= 25 * dt;
    e.group.position.addScaledVector(e.vel, dt); e.pos.copy(e.group.position);
    _e.set(e.spin.x * dt, e.spin.y * dt, e.spin.z * dt); _q.setFromEuler(_e); e.group.quaternion.multiply(_q);
    e.smokeCd -= dt;
    if (e.smokeCd <= 0) {
      e.smokeCd = 0.03;
      sprites.emit({ p: e.pos, vel: new THREE.Vector3(rng.range(-3, 3), rng.range(0, 4), rng.range(-3, 3)), size: 2.2, grow: 2.5, dur: 1.1, color: 0x1a1a1e, opacity: 0.55 });
      sprites.emit({ p: e.pos, vel: new THREE.Vector3(rng.range(-2, 2), rng.range(0, 2), rng.range(-2, 2)), size: 1.6, grow: 0.5, dur: 0.3, color: 0xff7a30, additive: true, opacity: 0.9 });
    }
    // flicker glow
    setFlash(e, 0.4 + 0.6 * Math.random());
    if (e.dieT >= e.dieDur) {
      explosions.spawn(e.pos, e.kind === 'mantis' ? 1.5 : 1.0);
      for (let i = 0; i < 10; i++) sprites.emit({ p: e.pos, vel: new THREE.Vector3(rng.range(-1, 1), rng.range(-0.5, 1), rng.range(-1, 1)).multiplyScalar(22), size: 4, grow: 2.5, dur: 1.6, color: 0x15141a, opacity: 0.6 });
      remove(e);
    }
  }

  function setFlash(e, f) {
    for (const m of e.group.userData.flashMats) { m.emissive.setRGB(f, f * 0.92, f * 0.85); m.emissiveIntensity = f * 2.2; }
  }

  function remove(e) {
    const i = list.indexOf(e); if (i >= 0) list.splice(i, 1);
    scene.remove(e.group); disposeCraft(e.group);
  }

  function updateBolts(dt) {
    enemyBolts.update(dt); playerBolts.update(dt);
    // enemy bolts vs player
    if (playerRef?.position) {
      for (const b of [...enemyBolts.bolts]) {
        if (b.p.distanceTo(playerRef.position) < 4.5) {
          enemyBolts.remove(b); stats.playerHits++;
          events?.emit('player:hit', { position: b.p.clone() });
          for (let i = 0; i < 8; i++) sprites.emit({ p: b.p, vel: new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).multiplyScalar(12), size: 1.2, grow: 0.5, dur: 0.4, color: 0xff6a80, additive: true, opacity: 1 });
        }
      }
    }
    // player bolts vs enemies (swept sphere: sample along segment)
    for (const b of [...playerBolts.bolts]) {
      let hit = null, best = 1e9;
      for (const e of list) {
        if (e.state !== 'fly' || !e.group.visible) continue;
        // closest point on segment prev->p to e.pos
        _a.copy(b.p).sub(b.prev); const L2 = _a.lengthSq();
        let tt = L2 > 0 ? THREE.MathUtils.clamp(_b.copy(e.pos).sub(b.prev).dot(_a) / L2, 0, 1) : 0;
        _b.copy(b.prev).addScaledVector(_a, tt);
        const d = _b.distanceTo(e.pos);
        if (d < e.radius * 0.95 && d < best) { best = d; hit = e; }
      }
      if (hit) { playerBolts.remove(b); damage(hit, 1, b.p); }
    }
  }

  function update(dt, t) {
    time = t ?? time + dt;
    runTimers(dt);
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i]; e.age += dt;
      if (e.state === 'fly') {
        e.dist += e.speed * dt;
        placeOnPath(e, dt);
        if (!list.includes(e)) continue;
        if (e.group.visible) tryFire(e, dt);
        // damage flash + scale punch (anticipation/overshoot)
        if (e.flash > 0) { e.flash = Math.max(0, e.flash - dt * 6); setFlash(e, e.flash); }
        if (e.punch > 0) { e.punch = Math.max(0, e.punch - dt * 5); }
        const k = 1 + Math.sin(e.punch * Math.PI) * 0.14 * e.punch;
        e.group.scale.set(k, k, 1 / k);
        // engine glow pulse
        for (const c of e.group.children) if (c.userData.slot === 'engineGlow') c.scale.setScalar(c.userData.baseScale * (0.85 + 0.25 * Math.sin(time * 27 + e.phase)));
      } else if (e.state === 'dying') {
        updateDying(e, dt);
      }
    }
    updateBolts(dt);
    explosions.update(dt, ctx.camera);
    sprites.update(dt);
  }

  /** Player fires a bolt from `origin` toward `target` (world). */
  function playerFire(origin, target, speed = 420) {
    _a.copy(target).sub(origin).normalize();
    playerBolts.fire(origin, _a, speed, 'player');
  }

  function dispose() {
    for (const e of [...list]) remove(e);
    enemyBolts.dispose(); playerBolts.dispose(); explosions.dispose(); sprites.dispose();
  }

  return { update, spawnWave, list, damage, kill, playerFire, dispose, stats, bolts: enemyBolts, playerBolts, explosions, sprites, PATHS, FORMATIONS };
}
