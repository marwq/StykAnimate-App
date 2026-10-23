// Sonic's key poses (character frame: facing right, y down, hip at origin, unscaled).
import {REST} from './sonic.mjs';
import {D, lerp, smooth, smoother, easeOut, easeInOut, range, lerpAngle, GROUND_ANKLE} from './motion.mjs';

export const HEEL = {x: -18, y: 40}, BALL = {x: 36, y: 40};
/** Rotates the foot by tilt about a contact point given relative to the ankle; returns the ankle target. */
export function footPivot(ankle, pivot, tilt) {
  const px = ankle.x + pivot.x, py = ankle.y + pivot.y, c = Math.cos(tilt), s = Math.sin(tilt);
  return {x: px - c * pivot.x + s * pivot.y, y: py - s * pivot.x - c * pivot.y, tilt};
}

export function blendPose(a, b, k) {
  if (k <= 0) return a; if (k >= 1) return b;
  const out = {...b};
  for (const key of ['dy', 'torso', 'head', 'tail']) out[key] = lerp(a[key] ?? 0, b[key] ?? 0, k);
  const lt = (p, q) => ({x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k), tilt: lerp(p.tilt ?? 0, q.tilt ?? 0, k), bend: k < 0.5 ? p.bend : q.bend});
  if (a.legs && b.legs) out.legs = {near: lt(a.legs.near, b.legs.near), far: lt(a.legs.far, b.legs.far)};
  // Arms may be given as IK targets or as absolute angles; blend in angle space when they differ.
  if (a.arms && b.arms && !a.abs?.nUpper && !b.abs?.nUpper) out.arms = {near: lt(a.arms.near, b.arms.near), far: lt(a.arms.far, b.arms.far)};
  else { const aa = armAngles(a), bb = armAngles(b); out.arms = undefined; out.abs = {...(b.abs ?? {})}; for (const key of Object.keys(bb)) out.abs[key] = lerpAngle(aa[key], bb[key], k); }
  return out;
}

import {ik2, BONE} from './sonic.mjs';
/** Absolute arm angles for a pose (resolving IK targets). */
export function armAngles(p) {
  const td = p.torso ?? 0, rot = q => ({x: q.x * Math.cos(td) - q.y * Math.sin(td), y: q.x * Math.sin(td) + q.y * Math.cos(td)});
  const out = {};
  for (const [key, shoulder, l1, l2, up, fo] of [['near', REST.nShoulder, BONE.upper, BONE.fore, 'nUpper', 'nFore'], ['far', REST.fShoulder, BONE.farUpper, BONE.farFore, 'fUpper', 'fFore']]) {
    if (p.abs?.[up] !== undefined) { out[up] = p.abs[up]; out[fo] = p.abs[fo]; continue; }
    const t = p.arms?.[key];
    if (!t) { out[up] = 112 * D; out[fo] = 95 * D; continue; }
    const [a1, a2] = ik2(rot(shoulder), t, l1, l2, t.bend ?? -1);
    out[up] = a1; out[fo] = a2;
  }
  return out;
}

const stand = (drop = 0, farTilt = 0, nearX = REST.nAnkle.x - 2, farX = REST.fAnkle.x + 4) => ({
  near: {x: nearX, y: GROUND_ANKLE - drop, tilt: 0},
  far: farTilt ? {...footPivot({x: farX, y: GROUND_ANKLE - drop}, HEEL, farTilt)} : {x: farX, y: GROUND_ANKLE - drop, tilt: 0},
});

/** Opening idle: hand on hip, impatient foot taps, a glance up at the sun. t in frames. */
export function idlePose(t, {lookUp, lookBack, ready}) {
  const breath = Math.sin(t / 30 * 2 * Math.PI * 0.55);
  const taps = t > 2 && t < lookUp + 2;
  const ph = ((t - 3) % 10) / 10;
  const tap = taps ? Math.max(0, Math.sin(Math.PI * Math.min(1, ph * 1.7))) : 0;
  const look = smoother(range(t, lookUp, lookUp + 9)) - smoother(range(t, lookBack, lookBack + 9));
  const r = smoother(range(t, ready[0], ready[1]));
  const legs = stand(0, -26 * D * tap);
  legs.near.y -= breath * 1.2; legs.far.y -= breath * 1.2;
  return {
    dy: 1.2 * breath,
    torso: (-3 + 1.2 * breath - 5 * look + 10 * r) * D,
    head: (-1 - 16 * look + 4 * r + 2 * tap) * D,
    tail: 8 * D * Math.sin(t * 0.23),
    legs,
    arms: {
      near: {x: lerp(-15, 4, r), y: lerp(-4, -22, r), bend: -1},
      far: {x: lerp(-2, 22, r), y: lerp(-2, -26, r), bend: -1},
    },
  };
}

/** Crouch into the spin dash (k 0..1). */
export function crouchPose(k) {
  const e = easeInOut(k);
  return {
    dy: 36 * e,
    torso: lerp(7, 48, e) * D,
    head: lerp(3, 16, e) * D,
    tail: 0,
    legs: {near: {x: REST.nAnkle.x - 6, y: GROUND_ANKLE - 36 * e, tilt: 0}, far: {x: REST.fAnkle.x + 12 * e, y: GROUND_ANKLE - 36 * e, tilt: 0}},
    arms: {near: {x: lerp(4, 24, e), y: lerp(-22, -8, e), bend: -1}, far: {x: lerp(22, 34, e), y: lerp(-26, -10, e), bend: -1}},
  };
}

/** Airborne leap against the sun: arm thrust ahead, legs split (k 0..1 opening). */
export function starPose(k) {
  const e = easeOut(k, 3);
  return {
    dy: 0,
    torso: lerp(38, -12, e) * D,
    head: lerp(20, -16, e) * D,
    tail: 24 * D * e,
    legs: {near: {x: lerp(16, 34, e), y: lerp(30, 30, e), tilt: lerp(30, 44, e) * D, bend: 1}, far: {x: lerp(12, -52, e), y: lerp(34, 60, e), tilt: lerp(30, 62, e) * D}},
    abs: {nUpper: lerp(60, -4, e) * D, nFore: lerp(-40, -10, e) * D, fUpper: lerp(60, 128, e) * D, fFore: lerp(-30, 150, e) * D},
  };
}

/** Legs reaching down for the landing, arms up for balance. */
export function dropPose(k) {
  const e = smooth(k);
  return {
    dy: 0, torso: lerp(20, 4, e) * D, head: lerp(10, -4, e) * D, tail: 10 * D,
    legs: {near: {x: lerp(10, -10, e), y: lerp(48, 78, e), tilt: lerp(30, 12, e) * D}, far: {x: lerp(24, 20, e), y: lerp(40, 70, e), tilt: lerp(30, 6, e) * D}},
    abs: {nUpper: lerp(30, -150, e) * D, nFore: lerp(-40, -110, e) * D, fUpper: lerp(20, -40, e) * D, fFore: lerp(-50, -70, e) * D},
  };
}

/** Landing impact (k 0..1 recovery). */
export function landPose(k) {
  const squash = Math.exp(-k * 4) * (1 - Math.exp(-k * 30));
  return {
    dy: 10 + 34 * squash,
    torso: (10 + 26 * squash) * D, head: (2 + 10 * squash) * D, tail: 0,
    legs: {near: {x: -26, y: GROUND_ANKLE - 10 - 34 * squash, tilt: 0}, far: {x: 40, y: GROUND_ANKLE - 10 - 34 * squash, tilt: 0}},
    abs: {nUpper: lerp(-40, 150, smooth(k * 2)) * D, nFore: lerp(-60, 120, smooth(k * 2)) * D, fUpper: lerp(-20, 140, smooth(k * 2)) * D, fFore: lerp(-30, 110, smooth(k * 2)) * D},
  };
}

/** Braced skid (k 0..1 through the slide). */
export function skidPose(k) {
  const e = easeOut(k);
  return {
    dy: lerp(22, 12, e),
    torso: lerp(-16, -22, e) * D,
    head: lerp(8, 14, e) * D,
    tail: -10 * D,
    legs: {near: {x: -30, y: GROUND_ANKLE - lerp(22, 12, e), tilt: 0}, far: {...footPivot({x: 50, y: GROUND_ANKLE - lerp(22, 12, e)}, HEEL, -26 * D)}},
    abs: {nUpper: 150 * D, nFore: 115 * D, fUpper: 175 * D, fFore: 150 * D},
  };
}

/**
 * Finale: settle from the skid, point ahead with a little wag, then hands on hips
 * with an impatient foot tap. t is frames since the stop.
 */
export function finalPose(t) {
  const settle = smoother(range(t, 0, 12));
  const over = Math.sin(Math.PI * range(t, 4, 18)) * 0.6;
  const point = smoother(range(t, 12, 20)) * (1 - smoother(range(t, 50, 60)));
  const wag = point * Math.sin((t - 20) * 0.6) * (1 - range(t, 40, 50));
  const hips = smoother(range(t, 50, 60));
  const breath = Math.sin(t / 30 * 2 * Math.PI * 0.5);
  const ph = ((t - 62) % 11) / 11, tap = t > 62 ? Math.max(0, Math.sin(Math.PI * Math.min(1, ph * 1.7))) : 0;
  const legs = stand(0, -24 * D * tap, -26, 34);
  legs.near.y -= breath * 1.2 + 3 * over; legs.far.y -= breath * 1.2 + 3 * over;
  const torso = (lerp(-22, -6, settle) + 6 * over - 4 * point - 3 * hips) * D;
  const onHip = armAngles({torso, arms: {near: {x: -15, y: -5, bend: -1}, far: {x: -9, y: -4, bend: -1}}});
  const skid = {nUpper: 150 * D, nFore: 115 * D, fUpper: 175 * D, fFore: 150 * D};
  const rest = {nUpper: 100 * D, nFore: 75 * D, fUpper: onHip.fUpper, fFore: onHip.fFore};
  const pointing = {nUpper: (-4 + 6 * wag) * D, nFore: (-12 + 14 * wag) * D};
  const abs = {};
  for (const key of ['nUpper', 'nFore', 'fUpper', 'fFore']) {
    let v = lerpAngle(skid[key], rest[key], settle);
    if (pointing[key] !== undefined) v = lerpAngle(v, pointing[key], point);
    abs[key] = lerpAngle(v, onHip[key], hips);
  }
  return {
    dy: 1.2 * breath + 3 * over,
    torso,
    head: (lerp(14, -4, settle) - 6 * point - 4 * hips + 3 * tap) * D,
    tail: 10 * D * Math.sin(t * 0.2),
    legs, abs,
  };
}
