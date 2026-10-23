// Motion helpers: easing, splines and Sonic's procedural cycles.
import {REST} from './sonic.mjs';

export const D = Math.PI / 180;
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = t => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeIn = (t, p = 2) => Math.pow(clamp(t), p);
export const easeOut = (t, p = 2) => 1 - Math.pow(1 - clamp(t), p);
export const easeInOut = (t, p = 2) => { t = clamp(t); return t < .5 ? Math.pow(2 * t, p) / 2 : 1 - Math.pow(2 - 2 * t, p) / 2; };
export const range = (t, a, b) => clamp((t - a) / (b - a));
export const mix = (a, b, t) => Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], t)) : lerp(a, b, t);
export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const lerpAngle = (a, b, t) => a + wrap(b - a) * t;

/** Deterministic noise for secondary motion. */
export function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
export function noise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; }

/** Periodic Catmull-Rom through keys [{t, v:[...]}] with t in [0,1). */
export function periodic(keys) {
  const n = keys.length;
  return u => {
    u = ((u % 1) + 1) % 1;
    let i = n - 1;
    for (let k = 0; k < n; k++) if (keys[k].t <= u) i = k;
    const k0 = keys[(i - 1 + n) % n], k1 = keys[i], k2 = keys[(i + 1) % n], k3 = keys[(i + 2) % n];
    const t1 = k1.t, t2 = k2.t + (i + 1 >= n ? 1 : 0);
    const t0 = k0.t - (i - 1 < 0 ? 1 : 0), t3 = k3.t + (i + 2 >= n ? 1 : 0) + (i + 1 >= n && i + 2 < n ? 0 : 0);
    const T3 = (i + 2 >= n) ? keys[(i + 2) % n].t + 1 : k3.t;
    const uu = u < t1 ? u + 1 : u, s = (uu - t1) / (t2 - t1);
    return k1.v.map((_, j) => {
      const p0 = k0.v[j], p1 = k1.v[j], p2 = k2.v[j], p3 = k3.v[j];
      const m1 = (p2 - p0) / (t2 - t0) * (t2 - t1), m2 = (p3 - p1) / (T3 - t1) * (t2 - t1);
      const s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * p1 + (s3 - 2 * s2 + s) * m1 + (-2 * s3 + 3 * s2) * p2 + (s3 - s2) * m2;
    });
  };
}

// Ankle height on level ground with the hip at rest height (character units, y down).
export const GROUND_ANKLE = REST.ground - REST.ankleHeight;

// Foot path for one stride: [x, y above ground (negative = up), foot tilt].
const STRIDE = periodic([
  {t: 0.00, v: [40, 0, -8 * D]},
  {t: 0.10, v: [18, 0, 0]},
  {t: 0.20, v: [-6, 0, 0]},
  {t: 0.30, v: [-30, -3, 18 * D]},
  {t: 0.40, v: [-50, -16, 50 * D]},
  {t: 0.52, v: [-58, -50, 75 * D]},
  {t: 0.64, v: [-28, -76, 40 * D]},
  {t: 0.76, v: [18, -66, 0 * D]},
  {t: 0.88, v: [48, -30, -22 * D]},
]);

/**
 * Run pose at phase u (cycles), on level ground. lean in radians; stride scales the
 * foot path; drop lowers the hip.
 */
export function runPose(u, {lean = 26 * D, stride = 1, drop = 9, lift = 1, armSwing = 1, headCounter = 0.75} = {}) {
  const leg = phase => {
    const [x, y, tilt] = STRIDE(phase);
    return {x: x * stride, y: GROUND_ANKLE - drop + y * lift, tilt};
  };
  const bob = 4.5 * Math.cos(2 * Math.PI * 2 * (u - 0.12));
  const near = leg(u), far = leg(u + 0.5);
  near.y -= bob; far.y -= bob;
  const swing = a => 108 * D + 62 * D * armSwing * Math.cos(2 * Math.PI * a);
  const arm = a => { const up = swing(a); return {up, fore: up - (70 + 25 * Math.cos(2 * Math.PI * a)) * D}; };
  const na = arm(u), fa = arm(u + 0.5);
  const torsoLean = lean + 2.5 * D * Math.cos(2 * Math.PI * 2 * (u - 0.2));
  return {
    dy: drop + bob,
    torso: torsoLean,
    head: -torsoLean * headCounter + 1.5 * D * Math.sin(2 * Math.PI * 2 * u),
    tail: -10 * D * Math.sin(2 * Math.PI * 2 * u),
    legs: {near, far},
    abs: {nUpper: na.up, nFore: na.fore, fUpper: fa.up, fFore: fa.fore},
  };
}
