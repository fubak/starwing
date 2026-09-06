/**
 * PIECE: enemies — Venomian fighter craft, formations, spline attack runs,
 * laser fire, damage flash, death spins, lock-on markers.
 *
 * Exports: createEnemyManager(ctx, playerRef) -> { update(dt), spawnWave(kind), list, ... }
 *          buildEnemyCraft(kind), CRAFT_KINDS, FORMATIONS
 * Showcase: continuous waves streaming past a stationary gun camera.
 */
import * as THREE from 'three';
import { createEnemyManager, FORMATIONS } from './manager.js';
import { createEnvironment } from './env.js';
import { createLockOnHud } from './hud.js';

export { createEnemyManager, FORMATIONS } from './manager.js';
export { buildEnemyCraft, CRAFT_KINDS, makeCraftMaterials } from './craft.js';

export async function create(ctx) {
  const { scene, camera, input, rng, events } = ctx;

  // ---- camera: stationary gun-camera, slightly above the deck, looking down-range
  const camBase = new THREE.Vector3(0, 6, 0);
  camera.position.copy(camBase);
  camera.fov = 58; camera.near = 0.5; camera.far = 6000; camera.updateProjectionMatrix();
  camera.lookAt(0, 4, -100);
  const camQ0 = camera.quaternion.clone();

  const env = createEnvironment(ctx);

  // player proxy: sits at the camera (the "Arwing" is the viewer here)
  const player = new THREE.Object3D(); player.position.copy(camBase); scene.add(player);
  const em = createEnemyManager(ctx, player);
  const hud = createLockOnHud(ctx, em);

  // ---- state
  const aim = new THREE.Vector2(0, 0);         // smoothed reticle in NDC
  let fireCd = 0, side = 1, shake = 0, flash = 0, t = 0, waveTimer = 0, waveIx = 0, score = 0;
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();

  // wave choreography: kicks off immediately so the first frames are busy
  const OPENING = [
    { kind: 'v', craft: 'vulture', path: 'strafe', mirror: 1, startDist: 30, speed: 95 },
    { kind: 'snake', craft: 'hornet', path: 'swoop', mirror: -1, startDist: 230, speed: 90 },
    { kind: 'circle', craft: 'mantis', path: 'cross', mirror: 1, startDist: 150, speed: 70 },
  ];
  const ROTATION = [
    { kind: 'v', path: 'dive' }, { kind: 'line', path: 'strafe' }, { kind: 'snake', path: 'weave' },
    { kind: 'circle', path: 'loop' }, { kind: 'v', path: 'swoop' }, { kind: 'snake', path: 'cross' }, { kind: 'line', path: 'dive' },
  ];
  function launch(o) {
    const w = em.spawnWave(o.kind, o);
    if (o.startDist) for (const e of em.list) if (e.wave === w) e.dist += o.startDist;
    hud.announce(w);
    return w;
  }
  OPENING.forEach(launch);

  events.on('player:hit', () => { shake = Math.max(shake, 1); flash = Math.max(flash, 0.35); });
  events.on('enemy:killed', ({ position }) => { const d = position.distanceTo(camera.position); shake = Math.max(shake, THREE.MathUtils.clamp(1 - d / 120, 0, 0.7)); score += 100; });
  events.on('enemy:hit', () => { score += 10; });

  // ---- autoplay script: chase the locked target with a little lag, fire in bursts, sweep the sky between targets
  const scriptAim = new THREE.Vector2();
  input.script = (tt) => {
    const L = hud.locked;
    if (L) { scriptAim.lerp(L.ndc, 0.09); } else { scriptAim.lerp(new THREE.Vector2(Math.sin(tt * 0.6) * 0.45, Math.sin(tt * 0.9 + 1) * 0.25), 0.05); }
    const burst = (tt % 1.6) < 1.1;
    return { x: THREE.MathUtils.clamp(scriptAim.x * 1.4, -1, 1), y: THREE.MathUtils.clamp(scriptAim.y * 1.4, -1, 1), buttons: burst || L ? ['fire'] : [] };
  };

  function update(dt, time) {
    t = time;
    // waves
    waveTimer -= dt;
    if (waveTimer <= 0) {
      const o = ROTATION[waveIx++ % ROTATION.length];
      launch({ ...o, mirror: rng.sign() });
      waveTimer = rng.range(3.2, 4.6);
    }

    // aim (input axes -> reticle) with damping
    aim.x = THREE.MathUtils.damp(aim.x, input.axes.x * 0.7, 8, dt);
    aim.y = THREE.MathUtils.damp(aim.y, input.axes.y * 0.55, 8, dt);

    // aim world point: along the reticle ray, or snapped to the lock target
    _v.set(aim.x, aim.y, 0.5).unproject(camera).sub(camera.position).normalize();
    const target = hud.locked && hud.locked.ndc.distanceTo(aim) < 0.16 ? _w.copy(hud.locked.e.pos) : _w.copy(camera.position).addScaledVector(_v, 260);

    // player fire: twin cannons alternating below the camera
    fireCd -= dt;
    if (input.isHeld('fire') && fireCd <= 0) {
      fireCd = 0.1; side = -side;
      const origin = new THREE.Vector3(side * 3.2, -2.4, -3).applyQuaternion(camQ0).add(camera.position);
      em.playerFire(origin, target, 460);
    }

    em.update(dt, time);
    env.update(dt, time);

    // camera: gentle drift + shake
    shake = Math.max(0, shake - dt * 3.5);
    flash = Math.max(0, flash - dt * 2.2);
    env.flash(flash * 0.6);
    const s = shake * shake;
    camera.position.set(
      camBase.x + Math.sin(time * 0.37) * 0.6 + (rng.next() - 0.5) * s * 1.2,
      camBase.y + Math.sin(time * 0.53) * 0.35 + (rng.next() - 0.5) * s * 1.2,
      camBase.z,
    );
    camera.quaternion.copy(camQ0);
    camera.rotateY(-aim.x * 0.05 + Math.sin(time * 0.29) * 0.01 + (rng.next() - 0.5) * s * 0.02);
    camera.rotateX(aim.y * 0.04 + Math.sin(time * 0.41) * 0.008 + (rng.next() - 0.5) * s * 0.02);
    camera.rotateZ(-aim.x * 0.03 + (rng.next() - 0.5) * s * 0.02);
    player.position.copy(camera.position);

    hud.update(dt, time, aim, score);
  }

  function dispose() {
    em.dispose(); env.dispose(); hud.dispose(); scene.remove(player);
  }

  return { update, dispose };
}
