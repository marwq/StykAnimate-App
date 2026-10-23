// Action props and effects: spin ball, rings, dust, sparkles, speed lines, loop and ramp.
import {FigureBuilder, radial, instance} from './figures.mjs';

export const RING_SEGMENTS = 20;
export const LOOP = {R: 262, band: 78};
export const RAMP = {Q: 320, alpha: 48 * Math.PI / 180};

const arcPts = (cx, cy, r, a0, a1, n) => Array.from({length: n + 1}, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

export function defineProps(lib) {
  // Spin ball: dark core, swirling quills, rim light and blur arcs.
  {
    const b = new FigureBuilder('Spin ball');
    b.circle(0, 0, 50, '#0b3f9a', {alpha: 0.35});            // soft blur halo
    b.circle(0, 0, 44, '#0c4fb4');
    for (let k = 0; k < 3; k++) {
      const a = k * 2 * Math.PI / 3, pts = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8, r = 10 + 34 * t, ang = a + 2.1 * t; pts.push([r * Math.cos(ang), r * Math.sin(ang)]); }
      for (let i = 8; i >= 0; i--) { const t = i / 8, r = 10 + 30 * t, ang = a + 2.1 * t + 0.42 * (1 - t) + 0.12; pts.push([r * Math.cos(ang), r * Math.sin(ang)]); }
      b.poly(pts, '#2b7be0');
    }
    b.circle(0, 0, 13, '#f7c88a');                              // tucked muzzle glimpse
    b.circle(4, -4, 7, '#ffe2b8', {alpha: 0.8});
    // rim light: a bright bent stroke along the upper-left edge
    const v = b.v(44 * Math.cos(3.6), 44 * Math.sin(3.6));
    b.seg(v, 44 * Math.cos(5.0), 44 * Math.sin(5.0), {visible: true, thickness: 5, color: '#9fd0ff', alpha: 0.75, bend: 1.4});
    // motion blur arcs
    const w = b.v(52 * Math.cos(0.3), 52 * Math.sin(0.3));
    b.seg(w, 52 * Math.cos(1.9), 52 * Math.sin(1.9), {visible: true, thickness: 7, color: '#ffffff', alpha: 0.35, bend: 1.6});
    const w2 = b.v(52 * Math.cos(3.4), 52 * Math.sin(3.4));
    b.seg(w2, 52 * Math.cos(5.0), 52 * Math.sin(5.0), {visible: true, thickness: 5, color: '#ffffff', alpha: 0.25, bend: 1.6});
    lib.add(b);
  }
  // Ring: two concentric chains (gold and highlight); poses squash it into a spinning ellipse.
  {
    const b = new FigureBuilder('Ring');
    const outer = [], inner = [];
    for (let i = 0; i <= RING_SEGMENTS; i++) { const a = i / RING_SEGMENTS * 2 * Math.PI; outer.push([15 * Math.cos(a), 15 * Math.sin(a)]); inner.push([12.2 * Math.cos(a), 12.2 * Math.sin(a)]); }
    b.polyline(outer, {thickness: 6.5, color: '#e09a00'});
    b.polyline(inner, {thickness: 2.6, color: '#fff27a'});
    lib.add(b);
  }
  // Dust puff and glow dot.
  { const b = new FigureBuilder('Dust'); b.circle(0, 0, 20, '#f6ead2', {paint: radial([[0, '#fff8ea', 0.95], [0.6, '#f3e2c2', 0.75], [1, '#e8d2ad', 0]])}); lib.add(b); }
  { const b = new FigureBuilder('Glow'); b.circle(0, 0, 40, '#ffffff', {paint: radial([[0, '#ffffff', 1], [0.35, '#e8f6ff', 0.6], [1, '#bfe6ff', 0]])}); lib.add(b); }
  { const b = new FigureBuilder('Warm glow'); b.circle(0, 0, 40, '#fff4c8', {paint: radial([[0, '#fffbe8', 1], [0.4, '#ffe9a0', 0.55], [1, '#ffd36a', 0]])}); lib.add(b); }
  // Soft contact shadow: a flat ellipse in two densities.
  {
    const b = new FigureBuilder('Shadow');
    const ell = (rx, ry) => Array.from({length: 28}, (_, i) => { const a = i / 28 * 2 * Math.PI; return [rx * Math.cos(a), ry * Math.sin(a)]; });
    b.poly(ell(70, 11), '#14501c', 0.18);
    b.poly(ell(48, 7), '#14501c', 0.22);
    lib.add(b);
  }
  // Iris-out: a screen-filling card with a round hole; the hole radius is posed per frame.
  {
    const b = new FigureBuilder('Iris');
    const outer = [[-4000, -4000], [4000, -4000], [4000, 4000], [-4000, 4000]], n = 72;
    const hole = Array.from({length: n}, (_, i) => { const a = -i / n * 2 * Math.PI; return [100 * Math.cos(a), 100 * Math.sin(a)]; });
    b.poly([...outer, [-4000, -4000], [100, 0], ...hole.slice(1), [100, 0.001], [-4000, -3999.999]], '#05070d');
    lib.add(b);
  }
  // Lens flare discs.
  { const b = new FigureBuilder('Flare disc'); b.circle(0, 0, 40, '#fff1c4', {paint: radial([[0, '#fff6d8', 0.05], [0.7, '#ffe7a8', 0.22], [0.9, '#ffd98a', 0.35], [1, '#ffd98a', 0]])}); lib.add(b); }
  { const b = new FigureBuilder('Flare dot'); b.circle(0, 0, 40, '#bfe3ff', {paint: radial([[0, '#d8f0ff', 0.5], [1, '#9fd2ff', 0]])}); lib.add(b); }
  // Four-point sparkle.
  {
    const b = new FigureBuilder('Sparkle');
    const pts = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * 2 * Math.PI - Math.PI / 2, r = i % 2 ? 4.5 : 22; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
    b.poly(pts, '#fffbe0');
    b.circle(0, 0, 5, '#ffffff');
    lib.add(b);
  }
  // Speed streak: a tapered translucent line.
  {
    const b = new FigureBuilder('Speed line');
    b.poly([[0, -1.6], [160, 0], [0, 1.6], [-6, 0]], '#ffffff', 0.55);
    lib.add(b);
  }
  // Shock ring: a full circle stroke (bent segment), scaled per frame.
  {
    const b = new FigureBuilder('Shock ring');
    const v = b.v(40, 0);
    b.seg(v, 40, 0.001, {visible: true, thickness: 6, color: '#ffffff', alpha: 0.85, bend: 2 * Math.PI, length: 2 * Math.PI * 40});
    lib.add(b);
  }
  // Spark (short bright line).
  { const b = new FigureBuilder('Spark'); b.polyline([[0, 0], [14, 0]], {thickness: 3, color: '#fff3a0'}); lib.add(b); }

  // Loop-de-loop: checkered ring band with a grass running surface on the inside.
  {
    const b = new FigureBuilder('Loop');
    const {R, band} = LOOP, n = 64, Ro = R + band;
    // band body: outer circle then inner circle reversed (even-odd ring)
    const outer = arcPts(0, 0, Ro, 0, 2 * Math.PI, n).slice(0, n), inner = arcPts(0, 0, R + 10, 0, 2 * Math.PI, n).slice(0, n);
    b.poly([...outer, outer[0], ...inner.slice().reverse(), inner[0]], '#c26a2a');
    // checker wedges: alternate darker cells in two rings
    const cells = 28;
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < cells; i++) {
      if ((i + ring) % 2) continue;
      const a0 = i / cells * 2 * Math.PI, a1 = (i + 1) / cells * 2 * Math.PI;
      const r0 = R + 10 + ring * (band - 10) / 2, r1 = R + 10 + (ring + 1) * (band - 10) / 2;
      b.poly([...arcPts(0, 0, r1, a0, a1, 3), ...arcPts(0, 0, r0, a1, a0, 3)], '#8c4318');
    }
    // outer rim shade and inner grass surface
    b.poly([...arcPts(0, 0, Ro, 0, 2 * Math.PI, n).slice(0, n), [Ro, 0], ...arcPts(0, 0, Ro - 8, 2 * Math.PI, 0, n).slice(0, n), [Ro - 8, 0]], '#6e3312', 0.6);
    b.poly([...arcPts(0, 0, R + 16, 0, 2 * Math.PI, n).slice(0, n), [R + 16, 0], ...arcPts(0, 0, R - 2, 2 * Math.PI, 0, n).slice(0, n), [R - 2, 0]], '#2b8f2c');
    b.poly([...arcPts(0, 0, R + 9, 0, 2 * Math.PI, n).slice(0, n), [R + 9, 0], ...arcPts(0, 0, R - 2, 2 * Math.PI, 0, n).slice(0, n), [R - 2, 0]], '#56c93f');
    b.poly([...arcPts(0, 0, R + 1.5, 0, 2 * Math.PI, n).slice(0, n), [R + 1.5, 0], ...arcPts(0, 0, R - 2, 2 * Math.PI, 0, n).slice(0, n), [R - 2, 0]], '#a6ec6a', 0.8);
    lib.add(b);
  }
  // Launch ramp: quarter pipe rising to the right, root at its foot on the ground.
  {
    const b = new FigureBuilder('Ramp');
    const {Q, alpha} = RAMP, n = 18;
    const surface = Array.from({length: n + 1}, (_, i) => { const p = alpha * i / n; return [Q * Math.sin(p), -Q * (1 - Math.cos(p))]; });
    const lip = surface.at(-1), backX = lip[0] + 26;
    const body = [...surface, [backX, lip[1] - 4], [backX + 40, 300], [-30, 300]];
    b.poly(body.map(([x, y]) => [x + 6, y + 6]), '#5a2a10', 0.35);
    b.poly(body, '#b05a22');
    const cell = 34;
    const topY = x => x < 0 ? 0 : x > lip[0] ? lip[1] : -Q * (1 - Math.cos(Math.asin(Math.min(1, x / Q))));
    for (let r = 0, ya = lip[1] - 10; ya < 300; r++, ya += cell) for (let c = 0, xa = -30; xa < backX + 40; c++, xa += cell) {
      if ((r + c) % 2) continue;
      const xb = xa + cell, yb = ya + cell, top = [];
      for (let i = 0; i <= 3; i++) { const x = xa + cell * i / 3; top.push([x, Math.max(ya, topY(x) + 14)]); }
      if (top.every(([, y]) => y >= yb - 0.5) || xa > backX + 10) continue;
      b.poly([...top.map(([x, y]) => [x, Math.min(y, yb)]), [Math.min(xb, backX + 30), yb], [xa, yb]], '#7a3612');
    }
    // dark outline on the open back edge and two launch chevrons on the face
    b.polyline([[backX, lip[1] - 4], [backX + 40, 300]], {thickness: 5, color: '#4a200a'});
    for (let i = 0; i < 2; i++) {
      const cx = 70 + i * 70, cy = topY(cx) + 50;
      b.poly([[cx - 16, cy + 14], [cx + 8, cy - 8], [cx + 22, cy - 26], [cx + 28, cy - 4], [cx + 10, cy + 12], [cx - 6, cy + 24]], '#ffe14a');
    }
    const grass = [...surface.map(([x, y]) => [x, y - 4]), [backX + 2, lip[1] - 6], [backX + 2, lip[1] + 14], ...surface.slice().reverse().map(([x, y], i) => [x - 3, y + 16 + 4 * Math.sin(i * 1.3)])];
    b.poly(grass.map(([x, y]) => [x, y + 5]), '#2b8f2c');
    b.poly(grass, '#4cc23a');
    b.poly([...surface.map(([x, y]) => [x, y - 3]), ...surface.slice().reverse().map(([x, y]) => [x, y + 3])], '#9be867', 0.8);
    lib.add(b);
  }
}

/** Pose of a ring spinning about its vertical axis (phase in turns). */
export function ringObject(lib, x, y, phase, {scale = 1, opacity = 1} = {}) {
  const entry = lib.get('Ring'), squash = Math.max(0.12, Math.abs(Math.cos(phase * 2 * Math.PI)));
  const angles = [], lengths = [];
  const chain = r => {
    angles.push(0); lengths.push(0); // the chain's start vertex from the root
    let prev = [r * squash, 0];
    angles[angles.length - 1] = 0; lengths[lengths.length - 1] = r * squash;
    for (let i = 1; i <= RING_SEGMENTS; i++) {
      const a = i / RING_SEGMENTS * 2 * Math.PI, p = [r * squash * Math.cos(a), r * Math.sin(a)];
      angles.push(Math.atan2(p[1] - prev[1], p[0] - prev[0])); lengths.push(Math.hypot(p[0] - prev[0], p[1] - prev[1])); prev = p;
    }
  };
  chain(15); chain(12.2);
  return instance(entry, {x, y, scale, opacity, angles, lengths});
}

