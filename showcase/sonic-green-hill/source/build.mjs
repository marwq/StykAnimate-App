// "Sonic: Green Hill Sunrise" — builds the complete StykAnimate project.
import {writeFileSync, readFileSync, existsSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Library, instance, hex} from './figures.mjs';
import {defineScenery, sceneryLayout, GROUND} from './scenery.mjs';
import {defineProps, ringObject, LOOP, RAMP} from './props.mjs';
import {sonicObjects, sonicFigureTypes, REST} from './sonic.mjs';
import {assemble} from './assemble.mjs';
import {idlePose, crouchPose, starPose, dropPose, landPose, skidPose, finalPose, blendPose} from './poses.mjs';
import {D, lerp, smooth, smoother, easeIn, easeOut, easeInOut, range, hash, noise1, runPose} from './motion.mjs';
import {effect, clip} from './vfx.mjs';
import {paintBackground} from '../../../src/paint.mjs';

// usage: node build.mjs [out.json] [--no-audio] [--no-vfx] [--poses t1,t2,...]
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../artifacts/sonic-green-hill/sonic.json');
mkdirSync(path.dirname(out), {recursive: true});
const FPS = 30, W = 1280, H = 720, S = 0.85;
const HIP = REST.ground * S;            // hip height above the soles
const BALL_R = 44 * S;
const X0 = 430;                          // Sonic's starting spot

// ---------------- timeline ----------------
const T = {
  lookUp: 34, lookBack: 56, crouch: 74, curl: 86, revs: [100, 118, 134, 148], release: 160, unfurl: 176,
};
const LOOP_X = 2700, RAMP_X = 3230;

// ---------------- track ----------------
const sLoop = LOOP_X - X0, sLoopEnd = sLoop + 2 * Math.PI * LOOP.R, sRamp = sLoopEnd + (RAMP_X - LOOP_X), sLip = sRamp + RAMP.Q * RAMP.alpha;
function track(s) {
  if (s < sLoop) return {x: X0 + s, y: GROUND, a: 0};
  if (s < sLoopEnd) { const th = (s - sLoop) / LOOP.R; return {x: LOOP_X + LOOP.R * Math.sin(th), y: GROUND - LOOP.R + LOOP.R * Math.cos(th), a: -th}; }
  if (s < sRamp) return {x: LOOP_X + (s - sLoopEnd), y: GROUND, a: 0};
  const p = Math.min(RAMP.alpha, (s - sRamp) / RAMP.Q);
  return {x: RAMP_X + RAMP.Q * Math.sin(p), y: GROUND - RAMP.Q * (1 - Math.cos(p)), a: -p};
}
const up = a => ({x: Math.sin(a), y: -Math.cos(a)});

// Speed along the track after the release, and the distance it integrates to.
const speedAt = t => {
  const k = t - T.release;
  if (k < 0) return 0;
  const base = 27 + 11 * Math.exp(-k / 9);
  return base;
};
const dist = [];
{ let s = 0; for (let t = 0; t < 2000; t++) { dist[t] = s; if (t >= T.release) s += speedAt(t); } }
const T_LIP = dist.findIndex(s => s >= sLip);
const lipState = track(sLip), launchV = speedAt(T_LIP) * 0.96;
const V0 = {x: launchV * Math.cos(RAMP.alpha), y: -launchV * Math.sin(RAMP.alpha)};
const GRAV = 0.62;
const tUp = -V0.y / GRAV;
const lipHip = {x: lipState.x + up(lipState.a).x * HIP, y: lipState.y + up(lipState.a).y * HIP};
// ballistic flight of the hip, in simulation frames
const flight = tau => ({x: lipHip.x + V0.x * tau, y: lipHip.y + V0.y * tau + 0.5 * GRAV * tau * tau});
const tLand = (() => { // hip returns to standing height above the ground
  const a = 0.5 * GRAV, b = V0.y, c = lipHip.y - (GROUND - HIP);
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
})();
// slow motion around the apex: output frame -> simulation time
const SLOW = {center: tUp + 1, width: 8, factor: 0.18};
const tauOf = [];
let T_LAND;
{
  let tau = 0;
  for (let t = T_LIP; ; t++) {
    tauOf[t] = tau;
    if (tau >= tLand) { T_LAND = t; tauOf[t] = tLand; break; }
    const w = Math.exp(-Math.pow((tau - SLOW.center) / SLOW.width, 2));
    tau += 1 - (1 - SLOW.factor) * w;
  }
}
const landX = flight(tLand).x;
const SKID = 20, T_STOP = T_LAND + SKID;
const skidDist = V0.x * SKID * 0.5;
const T_END = T_STOP + 104;

// ---------------- Sonic ----------------
const READY = [T.lookBack + 6, T.crouch];
const placeOnGround = (p, x) => ({...p, x, y: GROUND - HIP + p.dy * S, scale: S});
const RUN_CADENCE = 1 / 7.5;           // cycles per frame at top speed
const runPhase = t => (t - T.unfurl) * RUN_CADENCE + 0.15;
// flight choreography in simulation time
const FL = {curl: 2.5, open0: tUp - 7, open1: tUp - 1.5, close0: tUp + 7, close1: tUp + 9.5, drop0: tLand - 9};

/** Sonic's state at an output frame. */
function sonicAt(t) {
  if (t < T.crouch) return {kind: 'pose', pose: placeOnGround(idlePose(t, {...T, ready: READY}), X0)};
  if (t < T.curl) {
    const k = (t - T.crouch) / (T.curl - T.crouch);
    const p = blendPose(idlePose(t, {...T, ready: READY}), crouchPose(k), smooth(k * 2.5));
    return {kind: 'pose', pose: placeOnGround(p, X0), ballMix: k > 0.7 ? (k - 0.7) / 0.3 * 0.6 : 0};
  }
  if (t < T.unfurl) {
    // spin dash: revs pull the ball back; release launches it along the track
    let x = X0 - 6, y = GROUND - BALL_R, a = 0, spin = 0;
    for (let k = T.curl; k <= t; k++) spin += k < T.release ? lerp(0.55, 1.3, range(k, T.curl, T.release)) : speedAt(k) / BALL_R;
    if (t < T.release) {
      for (const r of T.revs) { const d = t - r; if (d >= 0 && d < 12) x -= 13 * (d < 2 ? d / 2 : Math.exp(-(d - 2) / 3)); }
      x -= 4 * range(t, T.curl, T.release);
    } else {
      const tr = track(dist[t]); a = tr.a;
      x = tr.x + up(a).x * BALL_R; y = tr.y + up(a).y * BALL_R;
    }
    const pop = t >= T.unfurl - 2 ? (t - (T.unfurl - 2) + 1) / 3 : 0;
    const enter = t < T.curl + 2 ? (t - T.curl + 1) / 3 : 1;
    return {kind: 'ball', x, y, rot: spin, scale: S * (0.86 + 0.14 * enter) * (1 + 0.25 * pop), opacity: 1 - 0.55 * pop, a};
  }
  if (t < T_LIP) {
    const s = dist[t], tr = track(s);
    const warm = smooth(range(t, T.unfurl, T.unfurl + 8));
    let p = runPose(runPhase(t), {lean: lerp(12, 30, warm) * D, stride: lerp(0.75, 1.08, warm), drop: 9, lift: lerp(0.6, 1.1, warm)});
    if (t < T.unfurl + 3) p = blendPose(starPose(0.15), p, (t - T.unfurl + 1) / 3);
    const n = up(tr.a), hip = (REST.ground - p.dy) * S;
    return {kind: 'pose', pose: {...p, x: tr.x + n.x * hip, y: tr.y + n.y * hip, rot: tr.a, scale: S}, ghosts: true};
  }
  if (t < T_LAND) {
    const tau = tauOf[t], pos = flight(tau);
    const ball = () => ({kind: 'ball', x: pos.x, y: pos.y + 8, rot: tau * 0.95, scale: S, a: 0});
    if (tau < FL.curl) {
      const p = runPose(runPhase(t), {lean: 30 * D});
      return {kind: 'pose', pose: {...p, x: pos.x, y: pos.y, rot: -RAMP.alpha * (1 - tau / FL.curl), scale: S}, ballMix: tau / FL.curl};
    }
    if (tau < FL.open0) return ball();
    if (tau < FL.close0) {
      const k = range(tau, FL.open0, FL.open1);
      const rot = lerp(-46 * D, 10 * D, easeOut(range(tau, FL.open0, FL.close0), 2.2));
      return {kind: 'pose', pose: {...starPose(k), x: pos.x, y: pos.y, rot, scale: S}, ballMix: tau < FL.open0 + 1.2 ? 1 - (tau - FL.open0) / 1.2 : 0, star: k};
    }
    if (tau < FL.close1) {
      const k = range(tau, FL.close0, FL.close1);
      return {kind: 'pose', pose: {...blendPose(starPose(1), crouchPose(1), smooth(k)), x: pos.x, y: pos.y, rot: lerp(10, 60, k) * D, scale: S}, ballMix: k};
    }
    if (tau < FL.drop0) return ball();
    const k = range(tau, FL.drop0, tLand);
    const p = dropPose(k * 1.3);
    return {kind: 'pose', pose: {...p, x: pos.x, y: pos.y, rot: lerp(40, 0, smooth(k * 1.6)) * D, scale: S}, ballMix: k < 0.15 ? 1 - k / 0.15 : 0};
  }
  if (t < T_STOP) {
    const k = (t - T_LAND) / SKID;
    const x = landX + V0.x * SKID * (k - k * k / 2);
    const p = blendPose(landPose(k * 2), skidPose(k), smooth(range(k, 0.25, 0.6)));
    return {kind: 'pose', pose: placeOnGround(p, x), skid: 1 - k};
  }
  return {kind: 'pose', pose: placeOnGround(finalPose(t - T_STOP), landX + skidDist)};
}

// ---------------- library ----------------
const lib = new Library(100);
defineScenery(lib);
defineProps(lib);

// ---------------- camera ----------------
const states = [];
for (let t = 0; t < T_END; t++) states[t] = sonicAt(t);
const focusOf = st => st.kind === 'ball' ? {x: st.x, y: st.y} : {x: st.pose.x, y: st.pose.y};
/** Camera that shows world point p at screen point q with zoom s (camera scale). */
const frameOn = (p, q, s) => ({x: p.x - 640 - (q.x - 640) * s, y: p.y - 360 - (q.y - 360) * s, scale: s});
// hero framing at the apex: Sonic in front of the sun
const apexTick = tauOf.findIndex((v, i) => i >= T_LIP && v >= tUp);
const apexFocus = focusOf(states[apexTick]);
const heroCam = frameOn(apexFocus, {x: 740, y: 270}, 0.74);
const SUN_R = 0.03;
const sunPos = {x: apexFocus.x - (1 - SUN_R) * heroCam.x - 10, y: apexFocus.y - (1 - SUN_R) * heroCam.y + 14};
const finalSpot = {x: landX + skidDist, y: GROUND - HIP - 30};
const T_LOOP_OUT = dist.findIndex(s => s >= sLoopEnd);

const cams = [];
{
  const skyShot = {x: 60, y: -430, scale: 1.08};
  const medium = frameOn({x: X0, y: GROUND - HIP - 20}, {x: 520, y: 410}, 0.86);
  const closer = frameOn({x: X0, y: GROUND - HIP - 10}, {x: 560, y: 430}, 0.78);
  const dash = frameOn({x: X0, y: GROUND - 44}, {x: 610, y: 470}, 0.62);
  let c = null, v = {x: 0, y: 0, scale: 0};
  for (let t = 0; t < T_END; t++) {
    const f = focusOf(states[t]);
    let target, stiff = 0.1, keyed = null, heroW = 0;
    if (t < T.release) {
      const blend = (a, b, k) => ({x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), scale: lerp(a.scale, b.scale, k)});
      keyed = blend(skyShot, medium, smoother(range(t, 6, 74)));
      keyed = blend(keyed, closer, smoother(range(t, 70, T.curl)));
      keyed = blend(keyed, dash, easeInOut(range(t, T.curl - 6, T.revs[1]), 2));
      const creep = range(t, T.revs[1], T.release);
      keyed = {...keyed, scale: keyed.scale - 0.04 * creep, x: keyed.x + 6 * creep};
    } else {
      const loopK = smooth(range(f.x, LOOP_X - 1000, LOOP_X - 300)) * (1 - smooth(range(t, T_LOOP_OUT - 6, T_LOOP_OUT + 18)));
      const run = frameOn({x: f.x, y: Math.min(f.y, GROUND - HIP)}, {x: 450, y: 440}, 1.08);
      const loopCam = frameOn({x: LOOP_X + 40, y: GROUND - LOOP.R + 30}, {x: 640, y: 380}, 1.42);
      target = {x: lerp(run.x, loopCam.x, loopK), y: lerp(run.y, loopCam.y, loopK), scale: lerp(run.scale, loopCam.scale, loopK)};
      stiff = t < T.release + 5 ? 0.03 : lerp(0.1, 0.16, loopK);
      if (t >= T_LIP - 6) {
        const air = frameOn(f, {x: 560, y: 380}, 1.22);
        heroW = smoother(range(t, apexTick - 22, apexTick - 6)) * (1 - smoother(range(t, apexTick + 18, apexTick + 38)));
        target = air; stiff = 0.14;
      }
      if (t >= T_LAND - 6) {
        const k = smoother(range(t, T_LAND - 6, T_STOP + 26));
        const land = frameOn({x: f.x, y: GROUND - HIP}, {x: 560, y: 450}, 1.0);
        const fin = frameOn(finalSpot, {x: 450, y: 400}, lerp(0.8, 0.74, range(t, T_STOP + 20, T_END)));
        target = {x: lerp(land.x, fin.x, k), y: lerp(land.y, fin.y, k), scale: lerp(land.scale, fin.scale, k)};
        stiff = 0.12;
      }
    }
    if (keyed) { if (c) v = {x: keyed.x - c.x, y: keyed.y - c.y, scale: keyed.scale - c.scale}; c = keyed; }
    else if (t === apexTick + 38) c = {...cams[t - 1]};
    else for (const key of ['x', 'y', 'scale']) {
      const w = Math.sqrt(stiff), a = w * w * (target[key] - c[key]) - 2 * w * v[key];
      v[key] += a; c[key] += v[key];
    }
    let shown = c;
    if (heroW > 0) shown = {x: lerp(c.x, heroCam.x, heroW), y: lerp(c.y, heroCam.y, heroW), scale: lerp(c.scale, heroCam.scale, heroW)};
    // shake: revs, release, landing
    let shake = 0;
    for (const r of T.revs) if (t >= r && t < r + 8) shake += 2.5 * Math.exp(-(t - r) / 2.5);
    if (t >= T.release && t < T.release + 14) shake += 10 * Math.exp(-(t - T.release) / 3.5);
    if (t >= T_LAND && t < T_LAND + 14) shake += 9 * Math.exp(-(t - T_LAND) / 3.5);
    const inLoop = dist[t] > sLoop && dist[t] < sLoopEnd;
    const angle = inLoop ? -0.025 * Math.sin((dist[t] - sLoop) / LOOP.R) : 0;
    cams[t] = {x: shown.x + shake * noise1(t * 1.7), y: shown.y + shake * noise1(t * 1.3 + 40), scale: shown.scale, angle_rad: angle};
  }
}

// ---------------- scenery placement ----------------
const LAYERS = [
  {key: 'sky', name: 'Sun', parallax: SUN_R, static: false, color: 'orange', locked: true},
  {key: 'clouds', name: 'Clouds', parallax: 0.07, color: 'teal', locked: true},
  {key: 'mountains', name: 'Mountains', parallax: 0.12, static: true, color: 'violet', locked: true},
  {key: 'sea', name: 'Sea', parallax: 0.18, static: true, color: 'blue', locked: true},
  {key: 'seaFx', name: 'Sea sparkles', parallax: 0.18, color: 'blue', locked: true},
  {key: 'hills', name: 'Hills', parallax: 0.38, static: true, color: 'green', locked: true},
  {key: 'near', name: 'Palms and flowers', parallax: 0.7, color: 'green', locked: true},
  {key: 'track', name: 'Track', static: true, color: 'orange', locked: true},
  {key: 'trackFx', name: 'Rings', color: 'orange', locked: true},
  {key: 'fxBack', name: 'Afterimages and dust', color: 'blue', locked: true},
  {key: 'sonic', name: 'Sonic', color: 'blue'},
  {key: 'fx', name: 'Effects', color: 'rose', locked: true},
  {key: 'front', name: 'Foreground', parallax: 1.45, color: 'green', locked: true},
];
let uid = 100000;
const staticItems = [];
const finalCam = frameOn(finalSpot, {x: 450, y: 400}, 0.77);
for (const item of sceneryLayout({keepClear: [{layer: 'hills', x0: finalSpot.x - 0.62 * finalCam.x - 300, x1: finalSpot.x - 0.62 * finalCam.x + 560}]})) {
  if (item.name === 'Sun') continue;
  staticItems.push({layer: item.layer, uid: uid++, object: instance(lib.get(item.name), item)});
}
staticItems.push({layer: 'track', uid: uid++, object: instance(lib.get('Loop'), {x: LOOP_X, y: GROUND - LOOP.R})});
staticItems.push({layer: 'track', uid: uid++, object: instance(lib.get('Ramp'), {x: RAMP_X, y: GROUND})});
// keep the ground strip above the loop's lower band
{
  const ground = staticItems.findIndex(i => lib.types.find(t => t.figure_type_id === i.object.figure_type_id)?.name === 'Ground');
  const [g] = staticItems.splice(ground, 1); staticItems.push(g);
}

// Animated scenery: palms (fronds sway), flowers, clouds, sea sparkles.
const near = [];
for (let i = 0, x = -300; x < 4600; i++) {
  const r = hash(i * 7 + 2);
  if (r < 0.42) near.push({type: 'palm', x, y: GROUND - 6, scale: 0.85 + 0.35 * hash(i * 3), seed: i});
  else if (r < 0.75) near.push({type: 'sunflower', x, y: GROUND - 4, scale: 0.9 + 0.3 * hash(i * 5), seed: i});
  else near.push({type: 'tulips', x, y: GROUND - 4, scale: 1, seed: i});
  x += 160 + 260 * hash(i * 13 + 5);
}
const clouds = [];
{
  const sunScreen = t => { const c = cams[t]; return {x: (sunPos.x - SUN_R * c.x - 640) / c.scale + 640, y: (sunPos.y - SUN_R * c.y - 360) / c.scale + 360}; };
  const checks = [0, 20, 40, 60, 80, apexTick - 20, apexTick - 10, apexTick, apexTick + 10, apexTick + 25, T_STOP, T_STOP + 30, T_STOP + 60, T_END - 1];
  for (let i = 0; i < 10; i++) {
    const cl = {x: -500 + i * 470 + 160 * hash(i * 3), y: 80 + 150 * hash(i * 7 + 1), k: i % 4, scale: 0.65 + 0.55 * hash(i * 11), drift: 0.12 + 0.18 * hash(i * 5)};
    for (let tries = 0; tries < 12; tries++) {
      const hit = checks.some(t => { const c = cams[t], sx = (cl.x + cl.drift * t - 0.07 * c.x - 640) / c.scale + 640, sy = (cl.y - 0.07 * c.y - 360) / c.scale + 360, sun = sunScreen(t);
        return Math.abs(sx - sun.x) < (190 * cl.scale + 170) / c.scale && Math.abs(sy - sun.y) < (60 * cl.scale + 150) / c.scale; });
      if (!hit) break;
      cl.x += 140;
    }
    clouds.push(cl);
  }
}
const sparkles = Array.from({length: 40}, (_, i) => ({x: -300 + 4800 * hash(i * 17 + 3), y: 448 + 50 * hash(i * 23 + 1), period: 24 + 30 * hash(i * 29), phase: hash(i * 31)}));
const foreground = [];
for (let i = 0, x = 1700; x < 9000; i++) { foreground.push({x, y: GROUND + 165 + 20 * hash(i * 3), scale: 0.6 + 0.35 * hash(i * 5), type: 'bush', seed: i}); x += 650 + 900 * hash(i * 9 + 4); }

/** Whether a point (with a radius) on a layer with this parallax is near the frame. */
function onScreen(t, x, y, radius, parallax = 1) {
  const c = cams[t], sx = (x - parallax * c.x - 640) / c.scale + 640, sy = (y - parallax * c.y - 360) / c.scale + 360, r = radius / c.scale;
  return sx > -r - 60 && sx < W + r + 60 && sy > -r - 60 && sy < H + r + 60;
}
function sceneryDynamic(t) {
  const groups = [];
  const time = t / FPS;
  const add = (layer, uidBase, objects) => groups.push({layer, uidBase, objects});
  // sun with slowly turning rays
  add('sky', 50000, [instance(lib.get('Sun rays'), {x: sunPos.x, y: sunPos.y, rot: time * 0.05}), instance(lib.get('Sun'), {x: sunPos.x, y: sunPos.y, scale: 1 + 0.012 * Math.sin(time * 2)})]);
  clouds.forEach((c, i) => onScreen(t, c.x + c.drift * t, c.y, 260 * c.scale, 0.07) && add('clouds', 51000 + i * 10, [instance(lib.get(`Cloud ${c.k + 1}`), {x: c.x + c.drift * t, y: c.y, scale: c.scale})]));
  sparkles.forEach((s, i) => {
    const ph = ((t / s.period + s.phase) % 1), a = Math.max(0, Math.sin(ph * Math.PI * 2));
    if (a > 0.05 && onScreen(t, s.x, s.y, 20, 0.18)) add('seaFx', 52000 + i * 10, [instance(lib.get('Sparkle dash'), {x: s.x, y: s.y, scale: 0.6 + 0.6 * a, opacity: a})]);
  });
  near.forEach((n, i) => {
    if (!onScreen(t, n.x, n.y - 150 * n.scale, 260 * n.scale, 0.7)) return;
    const base = 53000 + i * 20, sway = Math.sin(time * 1.6 + n.seed) * 0.06 + noise1(time * 0.7 + n.seed * 3) * 0.04;
    if (n.type === 'palm') {
      const trunk = instance(lib.get('Palm trunk'), {x: n.x, y: n.y, scale: n.scale, rot: sway * 0.15});
      const top = {x: n.x + (14 * Math.sin(1.4) + 18) * n.scale, y: n.y - 270 * n.scale};
      const fronds = [];
      const dirs = [-170, -140, -105, -70, -35, -8, 18, 160];
      dirs.forEach((d, j) => {
        const flip = d < -90 || d > 90;
        const ang = (flip ? 180 - d : d) * D;
        fronds.push(instance(lib.get('Palm frond'), {x: top.x, y: top.y, scale: n.scale * (0.85 + 0.25 * hash(j + n.seed)), rot: ang + sway * (1 + j * 0.15), flipX: flip}));
      });
      add('near', base, [trunk, ...fronds]);
    } else if (n.type === 'sunflower') {
      const stem = instance(lib.get('Sunflower stem'), {x: n.x, y: n.y, scale: n.scale, rot: sway * 0.5});
      const head = instance(lib.get('Sunflower head'), {x: n.x + 1 * n.scale, y: n.y - 92 * n.scale, scale: n.scale, rot: time * 0.6 + n.seed});
      add('near', base, [stem, head]);
    } else {
      add('near', base, [0, 1, 2].map(j => instance(lib.get('Tulip'), {x: n.x + j * 22 - 22, y: n.y, scale: 0.9 + 0.2 * hash(j + n.seed), rot: sway * 0.8 + (j - 1) * 0.08})));
    }
  });
  foreground.forEach((f, i) => {
    if (!onScreen(t, f.x, f.y, 160 * f.scale, 1.45)) return;
    add('front', 56000 + i * 10, [instance(lib.get('Bush'), {x: f.x, y: f.y, scale: f.scale, rot: 0.02 * Math.sin(time * 1.5 + f.seed)})]);
  });
  return groups;
}

// ---------------- rings ----------------
const rings = [];
{
  const ringAt = (s, h) => { const tr = track(s), n = up(tr.a); return {x: tr.x + n.x * h, y: tr.y + n.y * h}; };
  // rows along the run, gentle arcs, then around the loop
  const rows = [[700, 5], [1300, 6], [1900, 5]];
  for (const [s0, n] of rows) for (let i = 0; i < n; i++) { const s = s0 + i * 52; rings.push({...ringAt(s, 95 + 26 * Math.sin(Math.PI * i / (n - 1))), s}); }
  for (let i = 1; i < 12; i++) { const s = sLoop + i / 12 * 2 * Math.PI * LOOP.R; rings.push({...ringAt(s, 95), s}); }
  // along the flight arc
  for (let i = 0; i < 7; i++) { const tau = 4 + i * 3.2; const p = flight(tau); rings.push({x: p.x, y: p.y, tau}); }
}
// collection time: when Sonic's centre passes within reach
const collected = rings.map(r => {
  for (let t = T.unfurl - 20; t < T_END; t++) {
    const f = focusOf(states[t]);
    if (Math.hypot(f.x - r.x, f.y - 20 - r.y) < 60) return t;
  }
  return Infinity;
});

// ---------------- particles ----------------
const particles = [];
const emit = p => particles.push({uid: 60000 + particles.length * 2, ...p});
for (const r of T.revs) for (let i = 0; i < 5; i++) emit({type: 'dust', t0: r + i * 0.6, life: 22, x: X0 - 40, y: GROUND - 6, vx: -3 - 4 * hash(r + i), vy: -1.2 - 1.5 * hash(r * 3 + i), r0: 10, r1: 44 + 16 * hash(i), seed: r + i});
for (let t = T.curl + 4; t < T.release; t += 3) emit({type: 'dust', t0: t, life: 14, x: X0 - 34, y: GROUND - 4, vx: -2.5 - 2 * hash(t), vy: -0.8 - hash(t * 7), r0: 6, r1: 24, seed: t});
for (const r of T.revs) for (let i = 0; i < 4; i++) emit({type: 'spark', t0: r, life: 10, x: X0 - 20, y: GROUND - 10, vx: -6 - 6 * hash(r * 5 + i), vy: -3 - 4 * hash(r * 9 + i), seed: r + i});
for (let i = 0; i < 10; i++) emit({type: 'dust', t0: T.release + i * 0.4, life: 30, x: X0 - 20, y: GROUND - 8, vx: -6 - 9 * hash(i * 3 + 1), vy: -1 - 3 * hash(i * 5), r0: 16, r1: 70 + 30 * hash(i), seed: 500 + i});
emit({type: 'shock', t0: T.release, life: 12, x: X0, y: GROUND - 34, r0: 0.6, r1: 3.4});
emit({type: 'shock', t0: T.release + 2, life: 12, x: X0 + 40, y: GROUND - 34, r0: 0.3, r1: 2.4});
// running dust behind the feet on the ground
for (let t = T.release + 2; t < T_LIP; t += 2) {
  const s = dist[t]; if (s > sLoop - 30 && s < sLoopEnd + 30) continue;
  const tr = track(s); if (tr.a !== 0) continue;
  emit({type: 'dust', t0: t, life: 16, x: tr.x - 30, y: GROUND - 4, vx: -1.5, vy: -0.6 - 0.8 * hash(t), r0: 8, r1: 30 + 14 * hash(t * 3), seed: t, alpha: 0.6});
}
// unfurl burst and ring sparkles
for (let i = 0; i < 8; i++) emit({type: 'sparkle', t0: T.unfurl - 1, life: 12, x: 0, y: 0, follow: true, ang: i / 8 * 2 * Math.PI, dist0: 30, dist1: 95, seed: i});
rings.forEach((r, i) => { if (collected[i] < Infinity) emit({type: 'ringpop', t0: collected[i], life: 12, x: r.x, y: r.y, seed: i}); });
// landing
for (let i = 0; i < 12; i++) { const dir = i % 2 ? 1 : -1; emit({type: 'dust', t0: T_LAND + i * 0.3, life: 26, x: landX + dir * 10, y: GROUND - 6, vx: dir * (3 + 6 * hash(i * 7)), vy: -1 - 2.5 * hash(i * 3), r0: 12, r1: 50 + 20 * hash(i), seed: 900 + i}); }
emit({type: 'shock', t0: T_LAND, life: 10, x: landX, y: GROUND - 10, r0: 0.4, r1: 2.6, flat: true});
for (let t = T_LAND; t < T_STOP - 2; t++) {
  const st = states[t]; const fx = st.pose.x + 40 * S;
  emit({type: 'dust', t0: t, life: 18, x: fx, y: GROUND - 4, vx: 2 + 2 * hash(t), vy: -1 - hash(t * 3), r0: 8, r1: 34, seed: 1200 + t, alpha: 0.8 * (1 - (t - T_LAND) / SKID)});
  if (t % 2 === 0) emit({type: 'spark', t0: t, life: 8, x: fx + 10, y: GROUND - 4, vx: 6 + 6 * hash(t * 5), vy: -2 - 3 * hash(t * 7), seed: t});
}
// final glint
emit({type: 'glint', t0: T_STOP + 74, life: 16, x: 0, y: 0, follow: 'head'});

function particleObjects(t) {
  const groups = [];
  for (const p of particles) {
    const age = t - p.t0;
    if (age < 0 || age >= p.life) continue;
    const k = age / p.life;
    let objects = [], layer = 'fx';
    if (p.type === 'dust') {
      const r = lerp(p.r0, p.r1, easeOut(k, 2)), x = p.x + p.vx * age * (1 - k * 0.4), y = p.y + p.vy * age;
      objects = [instance(lib.get('Dust'), {x, y: y - r * 0.3, scale: r / 20, opacity: (p.alpha ?? 0.9) * Math.pow(1 - k, 1.4)})];
      layer = 'fxBack';
    } else if (p.type === 'spark') {
      const x = p.x + p.vx * age, y = p.y + p.vy * age + 0.4 * age * age;
      objects = [instance(lib.get('Spark'), {x, y, rot: Math.atan2(p.vy + 0.8 * age, p.vx), scale: 1 - k * 0.5, opacity: 1 - k})];
    } else if (p.type === 'shock') {
      const sc = lerp(p.r0, p.r1, easeOut(k, 3));
      objects = [instance(lib.get('Shock ring'), {x: p.x, y: p.y, scale: sc, opacity: 0.9 * (1 - k)})];
    } else if (p.type === 'sparkle') {
      const f = focusOf(states[Math.min(t, states.length - 1)]), d = lerp(p.dist0, p.dist1, easeOut(k, 2));
      objects = [instance(lib.get('Sparkle'), {x: f.x + d * Math.cos(p.ang), y: f.y + d * Math.sin(p.ang), scale: 0.9 * (1 - k), rot: k * 2})];
    } else if (p.type === 'ringpop') {
      objects = [
        instance(lib.get('Warm glow'), {x: p.x, y: p.y, scale: 0.5 + 0.6 * k, opacity: 0.9 * (1 - k)}),
        ...[0, 1, 2, 3].map(j => { const a = j * Math.PI / 2 + 0.6, d = 6 + 30 * easeOut(k); return instance(lib.get('Sparkle'), {x: p.x + d * Math.cos(a), y: p.y + d * Math.sin(a), scale: 0.55 * (1 - k * 0.7), rot: k * 3, opacity: 1 - k}); }),
      ];
    } else if (p.type === 'glint') {
      const st = states[t];
      const f = st.kind === 'pose' ? {x: st.pose.x + 30 * S, y: st.pose.y - 92 * S} : focusOf(st);
      const s = Math.sin(Math.PI * k);
      objects = [instance(lib.get('Glow'), {x: f.x, y: f.y, scale: 0.7 * s, opacity: 0.8 * s}), instance(lib.get('Sparkle'), {x: f.x, y: f.y, scale: 1.4 * s, rot: k * 1.5})];
    }
    groups.push({layer, uidBase: p.uid * 10, objects});
  }
  return groups;
}

// ---------------- apex glow and lens flare ----------------
function heroGroups(t) {
  const w = smoother(range(t, apexTick - 18, apexTick - 4)) * (1 - smoother(range(t, apexTick + 16, apexTick + 36)));
  if (w <= 0.01) return [];
  const c = cams[t], st = states[t], f = focusOf(st);
  const sun = {x: sunPos.x + (1 - SUN_R) * c.x, y: sunPos.y + (1 - SUN_R) * c.y};
  const center = {x: 640 + c.x, y: 360 + c.y};
  const groups = [{layer: 'fxBack', uidBase: 7000, objects: [
    instance(lib.get('Warm glow'), {x: f.x - 6, y: f.y - 30, scale: (3.2 + 0.25 * Math.sin(t * 0.4)) * w, opacity: 0.75 * w}),
  ]}];
  const flare = [[0.55, 'Flare disc', 1.1, 0.8], [0.95, 'Flare dot', 0.35, 0.7], [1.35, 'Flare disc', 0.7, 0.7], [1.75, 'Flare dot', 0.6, 0.5], [2.3, 'Flare disc', 1.6, 0.45]];
  groups.push({layer: 'fx', uidBase: 7100, objects: flare.map(([k, name, sc, a]) => instance(lib.get(name), {x: sun.x + (center.x - sun.x) * k, y: sun.y + (center.y - sun.y) * k, scale: sc * c.scale, opacity: a * w}))});
  return groups;
}

// ---------------- speed lines ----------------
function speedLines(t) {
  const st = states[t];
  const fast = (t >= T.release && t < T_LIP + 10) ? 1 : 0;
  if (!fast) return [];
  const c = cams[t], objects = [];
  for (let i = 0; i < 9; i++) {
    const life = 7, phase = (t + i * 3.3) % life, k = phase / life, seed = Math.floor((t + i * 3.3) / life) * 13 + i;
    const sy = 120 + 520 * hash(seed), sx = 1400 - 1700 * k - 300 * hash(seed + 1);
    const wx = (sx - 640) * c.scale + 640 + c.x, wy = (sy - 360) * c.scale + 360 + c.y;
    objects.push({o: instance(lib.get('Speed line'), {x: wx, y: wy, scale: c.scale * (0.8 + 1.2 * hash(seed + 2)), opacity: 0.35 * Math.sin(Math.PI * k)}), i});
  }
  return objects.map(({o, i}) => ({layer: 'fx', uidBase: 70000 + i * 10, objects: [o]}));
}

// ---------------- per-frame assembly ----------------
const GHOSTS = [{lag: 2, alpha: 0.42, uid: 20000}, {lag: 4, alpha: 0.26, uid: 21000}, {lag: 6, alpha: 0.13, uid: 22000}];
const tint = (objects, rgb, mix = 230) => objects.map(o => ({...o, color_override_raw: ((mix << 24) | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]) >>> 0, color_override_rgb: rgb, color_override_mix: mix}));
const scaleOpacity = (objects, a) => objects.map(o => ({...o, field28: Math.round(255 - (255 - (o.field28 ?? 0)) * a)}));

function sonicGroups(t) {
  const st = states[t], groups = [];
  if (st.kind === 'pose') {
    let objs = sonicObjects(st.pose);
    if (st.ballMix) objs = scaleOpacity(objs, 1 - st.ballMix * 0.8);
    groups.push({layer: 'sonic', uidBase: 1000, objects: objs});
    if (st.ballMix) groups.push({layer: 'sonic', uidBase: 5000, objects: [instance(lib.get('Spin ball'), {x: st.pose.x, y: st.pose.y + 10, scale: S * 0.9, opacity: st.ballMix, rot: t})]});
  } else {
    groups.push({layer: 'sonic', uidBase: 5000, objects: [instance(lib.get('Spin ball'), {x: st.x, y: st.y, rot: st.rot, scale: st.scale, opacity: st.opacity ?? 1})]});
    if (t < T.unfurl && t >= T.unfurl - 2) {
      const p = runPose(0.15, {lean: 10 * D, stride: 0.7});
      const tr = track(dist[t]), n = up(tr.a);
      groups.push({layer: 'sonic', uidBase: 1000, objects: scaleOpacity(sonicObjects({...p, x: tr.x + n.x * HIP, y: tr.y + n.y * HIP, rot: tr.a, scale: S}), 0.35 + 0.3 * (t - T.unfurl + 2))});
    }
    // charge glow while revving
    if (t < T.release && t >= T.curl) {
      const rev = T.revs.reduce((m, r) => Math.max(m, t >= r ? Math.exp(-(t - r) / 4) : 0), 0);
      groups.push({layer: 'fxBack', uidBase: 6000, objects: [instance(lib.get('Glow'), {x: st.x, y: st.y, scale: 1.4 + 0.8 * rev, opacity: 0.25 + 0.5 * rev})]});
    }
  }
  // afterimages while moving fast
  if (t > T.release + 1 && t < T_STOP) {
    GHOSTS.forEach((g, i) => {
      const past = states[t - g.lag]; if (!past) return;
      const slow = t >= T_LIP && t < T_LAND ? 1 - 0.75 * smoother(range(t, apexTick - 16, apexTick - 6)) * (1 - smoother(range(t, apexTick + 14, apexTick + 26))) : 1;
      const fade = (t < T_LAND ? 1 : 1 - (t - T_LAND) / SKID) * slow;
      if (fade <= 0) return;
      if (past.kind === 'pose') groups.push({layer: 'fxBack', uidBase: g.uid, objects: tint(scaleOpacity(sonicObjects(past.pose), g.alpha * fade), [70, 150, 255])});
      else groups.push({layer: 'fxBack', uidBase: g.uid + 900, objects: [{...instance(lib.get('Spin ball'), {x: past.x, y: past.y, rot: past.rot, scale: past.scale, opacity: g.alpha * fade}), ...{}}].map(o => tint([o], [70, 150, 255])[0])});
    });
  }
  return groups;
}
function shadowGroups(t) {
  const st = states[t];
  if (st.kind === 'pose' && dist[t] > sLoop - 40 && dist[t] < sLoopEnd + 40 && t >= T.release) return [];
  const f = focusOf(st);
  const h = Math.max(0, GROUND - (st.kind === 'ball' ? f.y + BALL_R : f.y + HIP));
  if (st.kind === 'pose' && st.pose.rot && Math.abs(st.pose.rot) > 0.3 && t < T_LIP) return [];
  const k = Math.max(0, 1 - h / 380);
  if (k <= 0.02) return [];
  return [{layer: 'trackFx', uidBase: 8800, objects: [instance(lib.get('Shadow'), {x: f.x + (st.kind === 'pose' ? 4 : 0), y: GROUND + 2, scale: S * (0.55 + 0.45 * k) * (st.kind === 'ball' ? 0.7 : 1), opacity: k})]}];
}
const IRIS = {start: T_END - 34, end: T_END - 8};
function irisGroups(t) {
  if (t < IRIS.start) return [];
  const st = states[t], f = {x: st.pose.x + 22 * S, y: st.pose.y - 70 * S};
  const c = cams[t], k = easeIn(range(t, IRIS.start, IRIS.end), 2.2);
  const r = Math.max(0.01, lerp(900 * c.scale, 0, k));
  const entry = lib.get('Iris'), angles = [], lengths = [];
  entry.type.segments.forEach((seg, i) => {
    const p = entry.builder.points.get(seg.segment_id), d = Math.hypot(p.x, p.y);
    const big = d > 1000, len = big ? d : (d < 1 ? 0.001 : r * d / 100);
    angles.push(Math.atan2(p.y, p.x)); lengths.push(len);
  });
  return [{layer: 'front', uidBase: 8900, objects: [instance(entry, {x: f.x + 0.45 * c.x, y: f.y + 0.45 * c.y, angles, lengths})]}];
}
function ringGroups(t) {
  const groups = [], c = cams[t];
  rings.forEach((r, i) => {
    if (t >= collected[i]) return;
    const sx = (r.x - 640 - c.x) / c.scale + 640;
    if (sx < -200 || sx > W + 200) return;
    groups.push({layer: 'trackFx', uidBase: 80000 + i * 10, objects: [ringObject(lib, r.x, r.y, t / 40 + i * 0.07, {scale: 1.25})]});
  });
  return groups;
}

// Pose preview sheet: --poses t1,t2,... renders Sonic alone at those frames side by side.
if (process.argv.includes('--poses')) {
  const list = process.argv[process.argv.indexOf('--poses') + 1].split(',').map(Number);
  const groups = [];
  list.forEach((t, i) => {
    const st = states[t], cx = 160 + i * 300, cy = 300;
    if (st.kind === 'pose') {
      const f = focusOf(st);
      groups.push({layer: 'sonic', uidBase: 1000 + i * 100, objects: sonicObjects({...st.pose, x: cx + (st.pose.x - f.x), y: cy + (st.pose.y - f.y)})});
    } else groups.push({layer: 'sonic', uidBase: 1000 + i * 100, objects: [instance(lib.get('Spin ball'), {x: cx, y: cy, rot: st.rot, scale: st.scale})]});
  });
  const doc = assemble({name: 'poses', width: 300 * list.length + 20, height: 520, fps: FPS, ticks: 1, figureTypes: [...sonicFigureTypes, ...lib.types],
    backgrounds: [{background_id: 1, kind: 2, color: 0xffffffff}], layers: [{key: 'sonic', name: 'Sonic'}], staticItems: [], reference: {x: 0, y: 0},
    dynamic: () => groups, camera: () => ({x: 0, y: 0, scale: 1})});
  writeFileSync(out, JSON.stringify(doc));
  console.log('pose sheet', list.length);
  process.exit(0);
}

const sky = paintBackground({type: 'linear', angle: 90, stops: [
  {offset: 0, color: hex('#1648b8'), opacity: 1}, {offset: 0.28, color: hex('#3a86e3'), opacity: 1},
  {offset: 0.46, color: hex('#86c6f4'), opacity: 1}, {offset: 0.53, color: hex('#ffeccc'), opacity: 1}, {offset: 1, color: hex('#ffd6a0'), opacity: 1}]});

const ticks = Number(process.argv.includes('--ticks') ? process.argv[process.argv.indexOf('--ticks') + 1] : T_END);
const doc = assemble({
  name: 'Sonic — Green Hill Sunrise', width: W, height: H, fps: FPS, ticks,
  figureTypes: [...sonicFigureTypes, ...lib.types],
  backgrounds: [{background_id: 1, name: 'Morning sky', ...sky}],
  layers: LAYERS, staticItems, reference: {x: 0, y: 0},
  dynamic: t => [...sceneryDynamic(t), ...shadowGroups(t), ...ringGroups(t), ...heroGroups(t), ...sonicGroups(t), ...particleObjects(t), ...speedLines(t), ...irisGroups(t)],
  camera: t => cams[t],
});
// ---------------- native effect clips ----------------
const SONIC_ROOT = 1000 + 18;   // the torso: the root of Sonic's joined assembly
const BALL = 5000;
const clips = [];
if (!process.argv.includes('--no-vfx')) {
  clips.push(clip({name: 'Sun bloom', target: {kind: 'scene'}, effects: [effect('bloom', {threshold: 0.94, softness: 0.25, radius: 30, intensity: 0.35, color: 0xfff1d0})]}));
  clips.push(clip({name: 'Warm grade', target: {kind: 'scene'}, effects: [effect('grade', {contrast: 1.05, saturation: 1.08, temperature: 0.05})]}));
  clips.push(clip({name: 'Vignette', target: {kind: 'scene'}, effects: [effect('vignette', {amount: 0.12, softness: 0.85})]}));
  // spin dash: blue charge glow on the ball, stronger with each rev
  { const g = effect('glow', {color: 0x5fb6ff, radius: 16, intensity: 0.6});
    const keys = [[T.curl, 0.3]]; for (const r of T.revs) keys.push([r, 1.6, 'ease-out'], [r + 10, 0.6]); keys.push([T.release, 1.8], [T.unfurl, 0.4]);
    clips.push(clip({name: 'Spin dash charge', target: {kind: 'figure', uid: BALL}, start: T.curl, duration: T.unfurl - T.curl, effects: [g], keys: {0: {intensity: keys}}})); }
  // shockwaves at the release and the landing (scene distortion centred on Sonic's screen position)
  for (const [name, t0, at, r1, strength] of [['Release shockwave', T.release, {x: X0, y: GROUND - 40}, 900, 26], ['Landing shockwave', T_LAND, {x: landX, y: GROUND - 10}, 700, 20]]) {
    const c = cams[t0], cx = ((at.x - 640 - c.x) / c.scale + 640) / W, cy = ((at.y - 360 - c.y) / c.scale + 360) / H;
    const w = effect('shockwave', {radius: 10, thickness: 60, strength, centerX: cx, centerY: cy});
    clips.push(clip({name, target: {kind: 'scene'}, start: t0, duration: 16, fadeOut: 6, effects: [w], keys: {0: {radius: [[t0, 10, 'ease-out'], [t0 + 16, r1]], strength: [[t0, strength], [t0 + 16, 0]]}}}));
  }
  // afterimages: a soft blur melts the overlapping parts into one streak
  for (const g of GHOSTS) clips.push(clip({name: `Afterimage blur ${g.lag}`, target: {kind: 'figure', uid: g.uid + 18}, effects: [effect('blur', {radius: 3 + g.lag * 0.6})]}));
  for (const g of GHOSTS) clips.push(clip({name: `Ball afterimage blur ${g.lag}`, target: {kind: 'figure', uid: g.uid + 900}, effects: [effect('blur', {radius: 3 + g.lag * 0.6})]}));
  // finale: a light sweep across Sonic with the glint
  { const sw = effect('lightSweep', {position: -0.3, angle: 30, width: 0.18, softness: 0.5, intensity: 1.2, color: 0xfff6d8});
    const t0 = T_STOP + 70; clips.push(clip({name: 'Finale shine', target: {kind: 'figure', uid: SONIC_ROOT}, start: t0, duration: 22, effects: [sw], keys: {0: {position: [[t0, -0.3, 'ease-in'], [t0 + 22, 1.3]]}}})); }
  { const g = effect('glow', {color: 0xffd76a, radius: 18, intensity: 0.7, blend: 0});
    clips.push(clip({name: 'Hero glow', target: {kind: 'figure', uid: SONIC_ROOT}, start: apexTick - 18, duration: 52, fadeIn: 10, fadeOut: 14, effects: [g]})); }
}
doc._styk.vfxClips = {version: 1, clips};
// embedded sound: score, effects and ring chimes (built by audio.py from the cue sheet)
{
  const audioPath = out.replace(/[^/]+$/, '') + 'audio/audio-state.json';
  if (!process.argv.includes('--no-audio') && existsSync(audioPath)) doc._styk.audio = JSON.parse(readFileSync(audioPath, 'utf8'));
}
// cue sheet for the sound design (frames)
const cues = {fps: FPS, end: T_END, taps: [8.9, 18.9, 28.9, T_STOP + 68.5, T_STOP + 79.5, T_STOP + 90.5, T_STOP + 101.5].filter(t => t < IRIS.end), curl: T.curl, revs: T.revs, release: T.release, unfurl: T.unfurl,
  rings: collected.filter(t => Number.isFinite(t)).sort((a, b) => a - b), loopIn: dist.findIndex(s => s >= sLoop), loopOut: T_LOOP_OUT, lip: T_LIP, apex: apexTick,
  slowStart: apexTick - 20, slowEnd: apexTick + 30, land: T_LAND, stop: T_STOP, point: T_STOP + 14, glint: T_STOP + 74, irisStart: IRIS.start, irisEnd: IRIS.end};
writeFileSync(out.replace(/\.json$/, '') + '.cues.json', JSON.stringify(cues));
writeFileSync(out, JSON.stringify(doc));
const objs = doc.keyframes.reduce((n, f) => n + f.objects.length, 0);
console.log(JSON.stringify({ticks, T, T_LIP, apexTick, T_LAND, T_STOP, T_END, landX: Math.round(landX), sun: sunPos, objects: objs, bytes: JSON.stringify(doc).length}));
