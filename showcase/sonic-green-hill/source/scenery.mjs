// Green Hill style scenery: figure definitions and their placement in parallax layers.
import {FigureBuilder, radial} from './figures.mjs';
import {hash, noise1} from './motion.mjs';

export const GROUND = 560;          // track surface (world y)
export const WORLD = {left: -1400, right: 9000};

const P = {
  grass: '#4cc23a', grassLight: '#8fe25a', grassDark: '#2b8f2c', grassEdge: '#1f6f25',
  dirt: '#c26a2a', dirtDark: '#8c4318', dirtShade: '#6e3312',
  trunk: '#b06a2e', trunkDark: '#7c431b', leaf: '#2fa13b', leafLight: '#6fd24a', leafDark: '#1e7a2a',
  petal: '#ffd21f', petalDark: '#f2a20c', center: '#8a4b16', purple: '#b04bd8', purpleDark: '#7a2aa8',
};

// ---------- shapes ----------
const circlePts = (cx, cy, rx, ry, n, a0 = 0, a1 = 2 * Math.PI) =>
  Array.from({length: n}, (_, i) => { const a = a0 + (a1 - a0) * i / (n - (a1 - a0 >= 2 * Math.PI - 1e-9 ? 0 : 1)); return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });

/** One closed path for an even-odd checkerboard over [x0,x1]x[y0,y1]: vertical stripes XOR horizontal stripes. */
function checkerPath(x0, y0, x1, y1, cell) {
  const pts = [];
  // vertical stripes: square wave along the top edge
  pts.push([x0, y0]);
  for (let x = x0; x < x1 - 1e-6; x += 2 * cell) {
    const xa = x, xb = Math.min(x + cell, x1);
    pts.push([xa, y1], [xb, y1], [xb, y0]);
    if (xb + cell < x1) pts.push([xb + cell, y0]);
  }
  pts.push([x1, y0]);
  // back along the top to the start (zero-area), then horizontal stripes down the left edge
  pts.push([x0 + 0.0001, y0]);
  for (let y = y0; y < y1 - 1e-6; y += 2 * cell) {
    const ya = y, yb = Math.min(y + cell, y1);
    pts.push([x1, ya], [x1, yb], [x0, yb]);
    if (yb + cell < y1) pts.push([x0, yb + cell]);
  }
  return pts;
}

/** Dark checker cells clipped below a top curve (one polygon per cell). */
function checkerCells(b, x0, y0, x1, y1, cell, topY, color, alpha = 1) {
  for (let r = 0, ya = y0; ya < y1; r++, ya += cell) for (let c = 0, xa = x0; xa < x1; c++, xa += cell) {
    if ((r + c) % 2) continue;
    const xb = Math.min(xa + cell, x1), yb = Math.min(ya + cell, y1), top = [];
    for (let i = 0; i <= 4; i++) { const x = xa + (xb - xa) * i / 4; top.push([x, Math.max(ya, topY(x))]); }
    if (top.every(([, y]) => y >= yb - 0.5)) continue;
    b.poly([...top.map(([x, y]) => [x, Math.min(y, yb)]), [xb, yb], [xa, yb]], color, alpha);
  }
}

/** Grass strip: blades on top, scalloped drips hanging over the dirt. */
function grassStrip(b, x0, x1, top, {depth = 26, blade = 18, bladeH = 9, scallop = 44, color = P.grass, light = P.grassLight, dark = P.grassDark, seed = 1}) {
  const pts = [];
  for (let x = x0, i = 0; x < x1; x += blade, i++) {
    const h = bladeH * (0.6 + 0.8 * hash(seed * 31 + i));
    pts.push([x, top], [Math.min(x + blade * 0.5, x1), top - h]);
  }
  pts.push([x1, top]);
  pts.push([x1, top + depth]);
  for (let x = x1, i = 0; x > x0; x -= scallop, i++) {
    const xa = Math.max(x - scallop, x0), d = depth + 6 + 10 * hash(seed * 17 + i);
    pts.push([x - scallop * 0.25, top + d], [x - scallop * 0.5, top + d + 4], [x - scallop * 0.75, top + d], [xa, top + depth]);
  }
  b.poly(pts.map(([x, y]) => [x, y + 7]), dark);       // shadow lip under the drips
  b.poly(pts, color);
  // highlight band along the top
  const hl = [];
  for (let x = x0; x <= x1; x += 40) hl.push([x, top + 3 + 2 * Math.sin(x * 0.05 + seed)]);
  for (let x = x1; x >= x0; x -= 40) hl.push([x, top + 9 + 2 * Math.sin(x * 0.07 + seed)]);
  b.poly(hl, light, 0.55);
}

// ---------- figure definitions ----------
export function defineScenery(lib) {
  // Sun: layered radial glows and a soft disc.
  {
    const b = new FigureBuilder('Sun');
    b.circle(0, 0, 520, '#fff6d8', {paint: radial([[0, '#fff3c8', 0.55], [0.25, '#ffe9b0', 0.32], [0.6, '#ffe2a8', 0.1], [1, '#ffe2a8', 0]])});
    b.circle(0, 0, 170, '#fffbe9', {paint: radial([[0, '#ffffff', 0.95], [0.45, '#fff8dc', 0.55], [1, '#fff0c0', 0]])});
    b.circle(0, 0, 58, '#fffef6', {paint: radial([[0, '#ffffff', 1], [0.75, '#fffbea', 1], [1, '#ffeeb8', 1]])});
    lib.add(b);
  }
  // Sun rays: thin translucent wedges, rotated slowly as one figure.
  {
    const b = new FigureBuilder('Sun rays');
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * 2 * Math.PI, w = (i % 2 ? 0.05 : 0.085), r0 = 70, r1 = 620 + 120 * (i % 3);
      b.poly([[r0 * Math.cos(a - w), r0 * Math.sin(a - w)], [r1 * Math.cos(a - w * 0.55), r1 * Math.sin(a - w * 0.55)], [r1 * Math.cos(a + w * 0.55), r1 * Math.sin(a + w * 0.55)], [r0 * Math.cos(a + w), r0 * Math.sin(a + w)]], '#fff5d0', 0.09);
    }
    lib.add(b);
  }
  // Clouds: overlapping puffs with a cool underside and warm sunlit rim.
  for (let k = 0; k < 4; k++) {
    const b = new FigureBuilder(`Cloud ${k + 1}`);
    const n = 5 + k % 3, puffs = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), x = (t - 0.5) * (220 + 60 * k), r = 38 + 34 * Math.sin(Math.PI * t) * (0.7 + 0.6 * hash(k * 13 + i));
      puffs.push([x, -r * 0.55, r]);
    }
    for (const [x, y, r] of puffs) b.circle(x, y + 10, r, '#cfdcf2', {alpha: 0.95});
    for (let i = 0; i < n - 1; i++) { const [xa, , ra] = puffs[i], [xb, , rb] = puffs[i + 1]; b.circle((xa + xb) / 2, 6, Math.min(ra, rb) * 0.75, '#cfdcf2', {alpha: 0.95}); }
    for (const [x, y, r] of puffs) b.circle(x, y, r, '#ffffff');
    for (const [x, y, r] of puffs) b.circle(x + r * 0.25, y - r * 0.28, r * 0.55, '#fffaf0', {alpha: 0.85});
    lib.add(b);
  }
  // Far mountains (two ranges) as long silhouettes with sunlit faces.
  const ridge = (name, x0, x1, base, height, step, color, lit, haze, seed) => {
    const b = new FigureBuilder(name), pts = [];
    const H = x => height * (0.3 + 0.7 * Math.pow(Math.abs(Math.sin(x * 0.0024 + seed)), 1.6) * (0.75 + 0.25 * noise1(x * 0.006 + seed * 7)) + 0.12 * Math.abs(noise1(x * 0.02 + seed)));
    for (let x = x0; x <= x1; x += step) pts.push([x, base - H(x)]);
    b.poly([[x0, base + 400], ...pts, [x1, base + 400]], color);
    // sunlit rim along the ridge
    b.poly([...pts.map(([x, y]) => [x, y]), ...pts.slice().reverse().map(([x, y]) => [x - 10, y + 26])], lit, 0.6);
    b.poly([[x0, base - 40], [x1, base - 40], [x1, base + 400], [x0, base + 400]], haze, 0.55);
    lib.add(b);
  };
  ridge('Mountains far', -900, 3600, 432, 250, 36, '#9cbfe8', '#c3dbf6', '#d6e8fa', 1.3);
  ridge('Mountains near', -900, 4200, 444, 160, 30, '#6f9fd2', '#93bbe6', '#b8d4f0', 4.1);
  // Sea: banded water (a nod to the 16-bit palette) with a bright horizon line.
  {
    const b = new FigureBuilder('Sea'), x0 = -900, x1 = 4600, top = 438;
    const bands = ['#d8f1fb', '#9fdaf5', '#6cc0ee', '#47a5e3', '#3189d6', '#2a73c4'];
    let y = top;
    bands.forEach((c, i) => { const h = 6 + i * 5; b.poly([[x0, y], [x1, y], [x1, y + h + 1], [x0, y + h + 1]], c); y += h; });
    b.poly([[x0, y], [x1, y], [x1, y + 300], [x0, y + 300]], '#2a6bb8');
    lib.add(b);
  }
  // Water sparkles: short white dashes that twinkle (per-frame opacity on separate objects).
  {
    const b = new FigureBuilder('Sparkle dash');
    b.polyline([[-9, 0], [9, 0]], {thickness: 2.6, color: '#ffffff'});
    lib.add(b);
  }
  // Mid hills: Green Hill mesas (rounded shoulders, grass cap with drips, checkered face).
  for (let k = 0; k < 4; k++) {
    const b = new FigureBuilder(`Hill ${k + 1}`);
    const w = [380, 520, 300, 440][k], h = [140, 190, 105, 165][k], rr = 46, bottom = 320;
    const topY = x => { const d = Math.abs(x) - (w / 2 - rr); return d <= 0 ? -h : -h + rr - Math.sqrt(Math.max(0, rr * rr - d * d)); };
    const outline = [];
    for (let i = 0; i <= 40; i++) { const x = -w / 2 + w * i / 40; outline.push([x, topY(x)]); }
    b.poly([[-w / 2, bottom], ...outline, [w / 2, bottom]], '#c8834a');
    checkerCells(b, -w / 2, -h, w / 2, bottom, 40, x => topY(x) + 4, '#a6622f');
    b.poly([[w / 2 - 70, -h + 40], [w / 2, -h + 40], [w / 2, bottom], [w / 2 - 70, bottom]], '#5a2a10', 0.18);
    // grass cap: blades on top, scalloped drips over the face
    const cap = [];
    for (let i = 0; i <= 40; i++) { const x = -w / 2 + w * i / 40; cap.push([x, topY(x) - (i % 2 ? 7 : 1)]); }
    const drips = [];
    for (let i = 40; i >= 0; i--) { const x = -w / 2 + w * i / 40, edge = Math.abs(x) > w / 2 - rr; drips.push([x, topY(x) + (edge ? 10 : 22 + (i % 4 === 0 ? 12 : i % 2 ? 4 : 8))]); }
    b.poly([...cap, ...drips].map(([x, y]) => [x, y + 6]), '#3a9a3a');
    b.poly([...cap, ...drips], '#5cc64a');
    b.poly([...outline.map(([x, y]) => [x, y + 2]), ...outline.slice().reverse().map(([x, y]) => [x, y + 8])], '#a2e66e', 0.7);
    lib.add(b);
  }
  // Waterfall: a ribbon of water down a cliff face, root at its lip.
  {
    const b = new FigureBuilder('Waterfall');
    b.poly([[-30, -4], [30, -4], [34, 330], [-34, 330]], '#5fb8ec');
    for (let i = 0; i < 6; i++) { const x = -26 + i * 10; b.poly([[x, 0], [x + 3.5, 0], [x + 4.5, 330], [x + 1, 330]], '#e6f6ff', 0.8); }
    b.poly([[-34, -6], [34, -6], [34, 6], [-34, 6]], '#ffffff', 0.9);
    lib.add(b);
  }
  // Track ground: one long strip (grass + even-odd checkered dirt).
  {
    const b = new FigureBuilder('Ground');
    const x0 = WORLD.left, x1 = WORLD.right, top = 0, bottom = 520;
    b.poly([[x0, top + 12], [x1, top + 12], [x1, bottom], [x0, bottom]], P.dirt);
    b.poly(checkerPath(x0, top + 40, x1, bottom, 64), P.dirtDark);
    b.poly([[x0, top + 12], [x1, top + 12], [x1, top + 40], [x0, top + 40]], P.dirtShade, 0.35);
    grassStrip(b, x0, x1, top, {seed: 3});
    lib.add(b);
  }
  // Palm tree: curved banded trunk and drooping fronds; fronds are separate so they sway.
  {
    const b = new FigureBuilder('Palm trunk');
    const n = 9; let prev = 0; const pts = [[0, 0]];
    for (let i = 1; i <= n; i++) pts.push([14 * Math.sin(i / n * 1.4) + i * 2, -i * 30]);
    pts.forEach(([x, y], i) => { if (i === 0) return; prev = b.seg(prev, x, y, {visible: true, thickness: 22 - i * 0.9, color: i % 2 ? P.trunk : P.trunkDark}); });
    lib.add(b);
  }
  {
    const b = new FigureBuilder('Palm frond');
    // A leaf from the root outward with droop and serrated edge.
    const L = 120, pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([L * t, 26 * t * t - 18 * Math.sin(Math.PI * t) * 0.3 - (i % 2 ? 0 : 6) * Math.sin(Math.PI * t)]); }
    for (let i = 10; i >= 0; i--) { const t = i / 10; pts.push([L * t, 26 * t * t + 16 * Math.sin(Math.PI * t) + (i % 2 ? 7 : 0) * Math.sin(Math.PI * t)]); }
    b.poly(pts, P.leaf);
    b.poly(pts.slice(0, 11).concat([[L, 26], ...pts.slice(0, 11).reverse().map(([x, y]) => [x, y + 6])]), P.leafLight, 0.8);
    b.polyline(Array.from({length: 9}, (_, i) => { const t = i / 8; return [L * t, 26 * t * t + 3 * Math.sin(Math.PI * t)]; }), {thickness: 2, color: P.leafDark});
    lib.add(b);
  }
  // Sunflower: stem, two leaves, rotating petal head (separate figure).
  {
    const b = new FigureBuilder('Sunflower stem');
    b.polyline([[0, 0], [2, -30], [-1, -60], [1, -86]], {thickness: 5, color: '#2c8f2f'});
    b.poly([[0, -30], [-22, -42], [-34, -36], [-16, -28]], '#36a83a');
    b.poly([[0, -52], [24, -64], [34, -56], [14, -48]], '#36a83a');
    lib.add(b);
  }
  {
    const b = new FigureBuilder('Sunflower head');
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * 2 * Math.PI;
      const tip = [30 * Math.cos(a), 30 * Math.sin(a)], l = [12 * Math.cos(a - 0.32), 12 * Math.sin(a - 0.32)], r = [12 * Math.cos(a + 0.32), 12 * Math.sin(a + 0.32)];
      b.poly([[0, 0], l, tip, r], i % 2 ? P.petal : P.petalDark);
    }
    b.circle(0, 0, 13, P.center);
    b.circle(-3, -3, 6, '#b06a24', {alpha: 0.8});
    lib.add(b);
  }
  // Purple tulip.
  {
    const b = new FigureBuilder('Tulip');
    b.polyline([[0, 0], [1, -22], [0, -40]], {thickness: 3.5, color: '#2c8f2f'});
    b.poly([[0, -6], [-14, -18], [-12, -10]], '#36a83a');
    b.poly([[-9, -40], [-11, -56], [-5, -50], [0, -60], [5, -50], [11, -56], [9, -40], [0, -36]], P.purple);
    b.poly([[-3, -40], [0, -58], [5, -50], [9, -40], [0, -37]], P.purpleDark, 0.6);
    lib.add(b);
  }
  // Foreground bush: overlapping leaf clumps, darker toward the bottom.
  {
    const b = new FigureBuilder('Bush');
    const clumps = [[-70, -20, 42], [-30, -48, 52], [20, -56, 56], [66, -30, 44], [96, -6, 30], [-100, 0, 28]];
    for (const [x, y, r] of clumps) b.circle(x, y + 8, r, '#145f22');
    for (const [x, y, r] of clumps) b.circle(x - 4, y, r * 0.9, '#1f7f2c');
    for (const [x, y, r] of clumps) b.circle(x - r * 0.3, y - r * 0.35, r * 0.45, '#3aa83c', {alpha: 0.9});
    b.poly([[-130, 0], [130, 0], [130, 80], [-130, 80]], '#145f22');
    lib.add(b);
  }
  // Foreground grass tuft (dark, out-of-focus feel).
  {
    const b = new FigureBuilder('Grass tuft');
    const pts = [[-70, 0]];
    for (let i = 0; i < 9; i++) { const x = -60 + i * 15; pts.push([x + 6, -40 - 50 * hash(i * 7 + 3)], [x + 13, -6]); }
    pts.push([70, 0], [70, 40], [-70, 40]);
    b.poly(pts, '#1f7a2a');
    lib.add(b);
  }
}

// ---------- placement ----------
/** Static objects per layer: [{layer, name, x, y, scale, rot, flipX}] */
export function sceneryLayout({keepClear = []} = {}) {
  const items = [];
  const clear = (layer, x, half) => !keepClear.some(c => c.layer === layer && x + half > c.x0 && x - half < c.x1);
  const put = (layer, name, x, y, opts = {}) => { if (opts.half === undefined || clear(layer, x, opts.half)) items.push({layer, name, x, y, ...opts}); };
  put('sky', 'Sun', 930, 250);
  put('mountains', 'Mountains far', 0, 0);
  put('mountains', 'Mountains near', 0, 0);
  put('sea', 'Sea', 0, 0);
  // hills spaced along the mid layer, waterfalls in a few gaps
  for (let i = 0, x = -600; x < 4600; i++) {
    const k = i % 4, sc = 0.85 + 0.3 * hash(i * 5 + 1), w = [380, 520, 300, 440][k] * sc;
    put('hills', `Hill ${k + 1}`, x, 540 + 12 * hash(i * 3), {scale: sc, half: w / 2});
    const gap = 120 + 220 * hash(i * 11 + 2);
    if (i % 3 === 1) put('hills', 'Waterfall', x + w * 0.12, 540 - [140, 190, 105, 165][k] * sc + 14, {scale: 0.85, half: w / 2});
    x += w / 2 + gap + [380, 520, 300, 440][(i + 1) % 4] * 0.5;
  }
  put('track', 'Ground', 0, GROUND);
  return items;
}
