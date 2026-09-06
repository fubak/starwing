// Easing + keyframe helpers for camera rigs and UI motion.
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inQuart: (t) => t ** 4,
  outQuart: (t) => 1 - (1 - t) ** 4,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  // overshoot: goes past 1 then settles (anticipation/overshoot feel)
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  outBackSoft: (t) => { const c1 = 0.9, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  // anticipation: dips below 0 first then shoots to 1
  inBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  inOutBack: (t) => {
    const c1 = 1.70158, c2 = c1 * 1.525;
    return t < 0.5 ? ((2 * t) ** 2 * ((c2 + 1) * 2 * t - c2)) / 2 : ((2 * t - 2) ** 2 * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
  outElastic: (t) => { const c4 = (2 * Math.PI) / 3; return t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; },
};

/** Normalised progress of t inside [a,b] with easing. */
export const seg = (t, a, b, ease = Ease.inOutCubic) => ease(clamp01((t - a) / (b - a)));

/**
 * Vector track: keys = [{t, v:[x,y,z], ease?}, ...] sorted by t.
 * Evaluates into `out` (THREE.Vector3). Ease applies to the segment *ending* at that key.
 */
export function evalTrack(keys, t, out) {
  if (t <= keys[0].t) return out.set(...keys[0].v);
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (t <= k.t) {
      const p = keys[i - 1];
      const u = (k.ease ?? Ease.inOutCubic)(clamp01((t - p.t) / (k.t - p.t)));
      return out.set(lerp(p.v[0], k.v[0], u), lerp(p.v[1], k.v[1], u), lerp(p.v[2], k.v[2], u));
    }
  }
  const l = keys[keys.length - 1];
  return out.set(...l.v);
}

/** Scalar track: keys = [{t, v, ease?}] */
export function evalScalar(keys, t) {
  if (t <= keys[0].t) return keys[0].v;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (t <= k.t) {
      const p = keys[i - 1];
      return lerp(p.v, k.v, (k.ease ?? Ease.inOutCubic)(clamp01((t - p.t) / (k.t - p.t))));
    }
  }
  return keys[keys.length - 1].v;
}

/** Critically-damped-ish smoothing for cameras (frame-rate independent). */
export function damp(cur, target, lambda, dt) {
  return lerp(cur, target, 1 - Math.exp(-lambda * dt));
}
