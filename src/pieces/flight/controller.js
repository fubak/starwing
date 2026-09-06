// Reusable rail-flight controller: input -> position in a soft box, attitude
// (pitch/yaw/bank with anticipation), barrel roll with i-frames, boost / brake
// with gauge, fire cadence + recoil. No rendering, no THREE dependency.
//
//   const rail = createRailController({ box: { x: 24, yMin: 4, yMax: 32 } });
//   rail.update(dt, input);          // input: { axes:{x,y}, isHeld(name), wasPressed(name) }
//   rail.state.{x,y,z,vx,vy,pitch,yaw,bank,rollAngle,boost,brake,speed,gauge,invuln,recoil}
//   rail.events -> { rolled, fired, boostStart, brakeStart }  (flags true for the frame)
//
// Exposed so the rail stage / game can reuse the exact same feel.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

// barrel roll curve: slight anticipation, fast middle, settles with overshoot
export const rollCurve = (t) => {
  const c1 = 0.9, c2 = c1 * 1.525;
  return t < 0.5
    ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
};

export const RAIL_DEFAULTS = {
  box: { x: 24, yMin: 4, yMax: 32 },
  baseSpeed: 110,
  boostMul: 0.95, brakeMul: 0.55,
  agility: { x: 46, y: 34 },            // max lateral velocity (units/s)
  accel: 5.5,                           // damp lambda toward target velocity
  gaugeDrain: 0.45, gaugeRefill: 0.25,
  rollTime: 0.62, rollCool: 0.15, rollInvuln: 0.7, doubleTap: 0.3,
  fireInterval: 0.13,
  startY: 14,
};

export function createRailController(opts = {}) {
  const O = { ...RAIL_DEFAULTS, ...opts, box: { ...RAIL_DEFAULTS.box, ...(opts.box || {}) }, agility: { ...RAIL_DEFAULTS.agility, ...(opts.agility || {}) } };
  const S = {
    x: 0, y: O.startY, z: 0,
    vx: 0, vy: 0,
    ax: 0, ay: 0,                        // smoothed stick (for anticipation)
    pitch: 0, yaw: 0, bank: 0,
    speed: O.baseSpeed, baseSpeed: O.baseSpeed,
    boost: 0, brake: 0, gauge: 1,
    roll: { active: false, t: 0, dir: 1, cool: 0 },
    rollAngle: 0,
    fireCool: 0, recoil: 0,
    invuln: 0,
    time: 0,
  };
  const ev = { rolled: false, fired: false, boostStart: false, brakeStart: false };
  let tapL = -10, tapR = -10, prevX = 0, wasBoost = false, wasBrake = false;

  function update(dt, input) {
    dt = Math.min(Math.max(dt, 0), 1 / 20);
    S.time += dt;
    ev.rolled = ev.fired = ev.boostStart = ev.brakeStart = false;
    const ax = clamp(input.axes.x, -1, 1), ay = clamp(input.axes.y, -1, 1);
    S.ax = damp(S.ax, ax, 14, dt); S.ay = damp(S.ay, ay, 14, dt);

    // --- boost / brake with gauge
    const wantBoost = input.isHeld('boost') && S.gauge > 0.02;
    const wantBrake = input.isHeld('brake') && S.gauge > 0.02 && !wantBoost;
    if (wantBoost && !wasBoost) ev.boostStart = true;
    if (wantBrake && !wasBrake) ev.brakeStart = true;
    wasBoost = wantBoost; wasBrake = wantBrake;
    S.boost = damp(S.boost, wantBoost ? 1 : 0, wantBoost ? 6 : 3.5, dt);
    S.brake = damp(S.brake, wantBrake ? 1 : 0, wantBrake ? 7 : 4, dt);
    if (wantBoost || wantBrake) S.gauge = Math.max(0, S.gauge - dt * O.gaugeDrain); else S.gauge = Math.min(1, S.gauge + dt * O.gaugeRefill);
    S.speed = S.baseSpeed * (1 + S.boost * O.boostMul - S.brake * O.brakeMul);

    // --- barrel roll: Q/E or double-tap the stick
    const R = S.roll;
    R.cool = Math.max(0, R.cool - dt);
    let rollReq = 0;
    if (input.wasPressed('rollL')) rollReq = -1;
    if (input.wasPressed('rollR')) rollReq = 1;
    if (ax > 0.6 && prevX <= 0.6) { if (S.time - tapR < O.doubleTap) rollReq = 1; tapR = S.time; }
    if (ax < -0.6 && prevX >= -0.6) { if (S.time - tapL < O.doubleTap) rollReq = -1; tapL = S.time; }
    prevX = ax;
    if (rollReq && !R.active && R.cool <= 0) { R.active = true; R.t = 0; R.dir = rollReq; S.invuln = O.rollInvuln; ev.rolled = true; }
    if (R.active) {
      R.t += dt / O.rollTime;
      if (R.t >= 1) { R.active = false; R.t = 0; R.cool = O.rollCool; }
    }
    S.invuln = Math.max(0, S.invuln - dt);
    S.rollAngle = R.active ? -R.dir * rollCurve(R.t) * Math.PI * 2 : 0;

    // --- steering in the soft box: acceleration + drag, soft walls
    const agil = 1 - S.boost * 0.25 + S.brake * 0.3;
    S.vx = damp(S.vx, ax * O.agility.x * agil, O.accel, dt);
    S.vy = damp(S.vy, ay * O.agility.y * agil, O.accel, dt);
    S.x += S.vx * dt; S.y += S.vy * dt;
    const B = O.box;
    if (S.x > B.x) { S.x = damp(S.x, B.x, 12, dt); S.vx *= 0.6; }
    if (S.x < -B.x) { S.x = damp(S.x, -B.x, 12, dt); S.vx *= 0.6; }
    if (S.y > B.yMax) { S.y = damp(S.y, B.yMax, 12, dt); S.vy *= 0.6; }
    if (S.y < B.yMin) { S.y = damp(S.y, B.yMin, 12, dt); S.vy *= 0.6; }
    S.z -= S.speed * dt;

    // --- attitude: yaw/pitch toward velocity, bank into turns; raw stick adds anticipation
    S.yaw = damp(S.yaw, -S.vx * 0.012 - ax * 0.09, 8, dt);
    S.pitch = damp(S.pitch, S.vy * 0.014 + ay * 0.11, 8, dt);
    S.bank = damp(S.bank, -ax * 0.72 - S.vx * 0.005, 6.5, dt);
    S.recoil = Math.max(0, S.recoil - dt * 9);

    // --- fire cadence
    S.fireCool -= dt;
    if (input.isHeld('fire') && S.fireCool <= 0) { S.fireCool = O.fireInterval; S.recoil = 1; ev.fired = true; }
  }

  return { state: S, events: ev, opts: O, update };
}
