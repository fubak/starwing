// Reusable Star Fox style chase camera.
//
// The camera rides behind/above the ship on the rail with a little lateral
// lag (parallax), but the *framing* is solved in screen space: every frame we
// pick where the ship should sit on screen (centre-low, nudged by stick and
// velocity for anticipation/overshoot) and rotate the camera so the ship lands
// exactly there. The ship can therefore never wander to a corner or shrink,
// while the world still swings around it on turns.
//
//   const chase = createChaseCamera(camera, { dist: 10.5, height: 2.6 });
//   chase.update(dt, railState, { x: stickX, y: stickY });   // railState from createRailController
//   chase.kick(0.3);   // shake
import * as THREE from 'three';
import { damp } from './controller.js';

export const CHASE_DEFAULTS = {
  dist: 10.6, height: 2.7,
  boostDist: -1.6, brakeDist: 1.0, boostHeight: -0.3, brakeHeight: 0.6,
  lateralLag: 0.86,          // camera x = ship x * lateralLag (rest is parallax)
  lateralLambda: 5.5,
  fov: 60, boostFov: 15, brakeFov: -7,
  // screen anchor for the ship (NDC): centre-low like SF64 / Zero
  anchor: { x: 0, y: -0.34 },
  anchorLead: { x: 0.09, y: 0.06 },      // stick pushes ship toward the turn on screen
  anchorVel: { x: 0.0025, y: 0.0025 },   // velocity overshoot
  anchorClamp: { x: 0.17, y: 0.1 },
  anchorLambda: 5,
  bankRoll: 0.18,            // camera rolls with the ship bank
  lookAhead: 60,
};

export function createChaseCamera(camera, opts = {}) {
  const O = { ...CHASE_DEFAULTS, ...opts };
  for (const k of ['anchor', 'anchorLead', 'anchorVel', 'anchorClamp']) O[k] = { ...CHASE_DEFAULTS[k], ...(opts[k] || {}) };
  const pos = new THREE.Vector3(0, O.height, O.dist);
  const cur = { dist: O.dist, height: O.height, fov: O.fov, ax: 0, ay: 0, shake: 0, roll: 0 };
  const shipW = new THREE.Vector3(), d = new THREE.Vector3(), vLocal = new THREE.Vector3(), fwd = new THREE.Vector3(0, 0, -1);
  const q0 = new THREE.Quaternion(), r = new THREE.Quaternion(), m = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  const aim = new THREE.Vector3();
  let time = 0, first = true;

  function update(dt, S, stick = { x: 0, y: 0 }) {
    time += dt;
    if (first) { first = false; pos.set(S.x * O.lateralLag, S.y + cur.height, S.z + cur.dist); cur.ax = O.anchor.x; cur.ay = O.anchor.y; }
    // --- rig position in rail space: tracks z exactly (no size drift), lags in x, eases in y
    cur.dist = damp(cur.dist, O.dist + S.boost * O.boostDist + S.brake * O.brakeDist, 5, dt);
    cur.height = damp(cur.height, O.height + S.boost * O.boostHeight + S.brake * O.brakeHeight, 5, dt);
    pos.x = damp(pos.x, S.x * O.lateralLag, O.lateralLambda, dt);
    pos.y = damp(pos.y, S.y + cur.height, 6.5, dt);
    pos.z = S.z + cur.dist;
    cur.shake = Math.max(0, cur.shake - dt * 3);
    const shk = cur.shake * 0.1 + S.boost * 0.06;
    camera.position.set(pos.x + Math.sin(time * 61) * shk, pos.y + Math.cos(time * 47) * shk, pos.z);

    // --- FOV kick
    cur.fov = damp(cur.fov, O.fov + S.boost * O.boostFov + S.brake * O.brakeFov, 5, dt);
    if (Math.abs(camera.fov - cur.fov) > 0.01) { camera.fov = cur.fov; camera.updateProjectionMatrix(); }

    // --- screen anchor: where the ship should appear (NDC), with lead + overshoot
    const tx = O.anchor.x + THREE.MathUtils.clamp(stick.x * O.anchorLead.x + S.vx * O.anchorVel.x, -O.anchorClamp.x, O.anchorClamp.x);
    const ty = O.anchor.y + THREE.MathUtils.clamp(stick.y * O.anchorLead.y + S.vy * O.anchorVel.y, -O.anchorClamp.y, O.anchorClamp.y) - S.brake * 0.03 + S.boost * 0.03;
    cur.ax = damp(cur.ax, tx, O.anchorLambda, dt);
    cur.ay = damp(cur.ay, ty, O.anchorLambda, dt);

    // --- orientation: look toward the ship, then offset so the ship lands on the anchor
    shipW.set(S.x, S.y, S.z);
    d.copy(shipW).sub(camera.position).normalize();
    m.lookAt(camera.position, shipW, up); q0.setFromRotationMatrix(m);
    const th = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
    vLocal.set(cur.ax * th * camera.aspect, cur.ay * th, -1).normalize();
    r.setFromUnitVectors(vLocal, fwd);
    camera.quaternion.copy(q0).multiply(r);
    cur.roll = damp(cur.roll, S.bank * O.bankRoll, 8, dt);
    camera.rotateZ(cur.roll);
    camera.updateMatrixWorld();
    // where the camera is actually looking, far ahead (useful for reticle / world focus)
    aim.set(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(O.lookAhead).add(camera.position);
  }

  return {
    update,
    kick(a) { cur.shake = Math.max(cur.shake, a); },
    get aim() { return aim; },
    state: cur, opts: O,
    reset() { camera.up.set(0, 1, 0); camera.fov = O.fov; camera.updateProjectionMatrix(); },
  };
}
