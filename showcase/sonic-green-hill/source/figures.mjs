// Builds native figure definitions (Pivot-style segment trees with polygon fills)
// from points given in the figure's local coordinates. Root joint 0 is the origin.

export const hex = value => { const h = value.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const rgbOf = c => typeof c === 'string' ? hex(c) : c;

export class FigureBuilder {
  constructor(name) {
    this.name = name;
    this.segments = [];
    this.polys = [];
    this.points = new Map([[0, {x: 0, y: 0}]]);
    this.z = 0;
    this.nextId = 1;
  }
  /** Adds a segment from joint `parent` to the local point (x, y); returns its joint id. */
  seg(parent, x, y, {visible = false, thickness = 0, color = '#000000', alpha = 1, kind = 'line', bend = 0, paint, length} = {}) {
    const p = this.points.get(parent);
    if (!p) throw new Error(`missing joint ${parent}`);
    const id = this.nextId++;
    const dx = x - p.x, dy = y - p.y;
    const chord = Math.hypot(dx, dy);
    let angle = Math.atan2(dy, dx), len = length ?? chord;
    // A bent segment starts tangent to its arc: rotate back by half the bend and
    // lengthen the chord to the arc length so its end still lands on (x, y).
    if (Math.abs(bend) > 1e-7 && length === undefined) { angle -= bend / 2; len = chord * (bend / 2) / Math.sin(bend / 2); }
    // The app derives a segment's shape and visibility from primitive_code (and thickness).
    const primitive = {line: 0, circle: 1, circleFill: 3, circleClear: 4, squareLine: 6}[kind];
    if (primitive === undefined) throw new Error(`unknown segment kind ${kind}`);
    if (primitive === 0 && visible !== thickness > 0.01) throw new Error('a line is visible exactly when it has thickness');
    const segment = {
      segment_id: id, parent_id: parent, length: len, angle_rad: angle, thickness,
      bend_rad: bend, primitive_code: primitive, aux_code: 0, flags: primitive,
      segment_type: kind.startsWith('circle') ? 'circle' : 'line', segment_kind: kind,
      color_rgb: rgbOf(color), transparency: Math.round((1 - alpha) * 255), visible, z_order: ++this.z,
    };
    if (paint) segment.paint = paint;
    this.segments.push(segment);
    this.points.set(id, {x, y});
    return id;
  }
  /** Invisible fan vertex from the root. */
  v(x, y) { return this.seg(0, x, y); }
  /** Polygon through the given local points (fan vertices are created for it). */
  poly(points, color, alpha = 1) {
    const ids = points.map(([x, y]) => this.v(x, y));
    this.polys.push({ids, color: rgbOf(color), alpha, z: ++this.z});
    return ids;
  }
  /** Polygon through existing joint ids. */
  polyIds(ids, color, alpha = 1) { this.polys.push({ids, color: rgbOf(color), alpha, z: ++this.z}); }
  /** Filled circle (optionally with a radial paint) centered at (cx, cy). */
  circle(cx, cy, r, color, {alpha = 1, paint, parent = 0, outline = 0, kind} = {}) {
    const a = parent === 0 ? this.v(cx - r, cy) : parent;
    return this.seg(a, cx + r, cy, {visible: true, kind: kind ?? (outline ? 'circle' : 'circleFill'), color, alpha, paint, thickness: outline});
  }
  /** Visible polyline as a chain of segments. */
  polyline(points, {thickness = 4, color = '#000000', alpha = 1, kind = 'line', parent} = {}) {
    let j = parent ?? this.v(points[0][0], points[0][1]);
    const ids = [j];
    for (const [x, y] of points.slice(1)) { j = this.seg(j, x, y, {visible: true, thickness, color, alpha, kind}); ids.push(j); }
    return ids;
  }
  build(id) {
    const segments = this.segments.map(s => ({...s}));
    return {
      figure_type_id: id,
      name: this.name,
      segment_count: segments.length,
      segments,
      polyfills: this.polys.map((p, i) => ({
        polyfill_id: i + 1, segment_ids: p.ids, vertex_id_space: 'joint_tip_ids',
        color_rgb: p.color, alpha_raw: Math.round((1 - p.alpha) * 255), z_order: p.z,
      })),
      image_assets: [],
      text_assets: [],
    };
  }
  restAngles() { return this.segments.map(s => s.angle_rad); }
}

/** Registry of figure definitions used by the scene. */
export class Library {
  constructor(firstId = 100) { this.types = []; this.byName = new Map(); this.nextId = firstId; }
  add(builder) {
    const id = this.nextId++;
    const type = builder.build(id);
    const entry = {id, type, angles: builder.restAngles(), builder};
    this.types.push(type); this.byName.set(builder.name, entry);
    return entry;
  }
  get(name) { const e = this.byName.get(name); if (!e) throw new Error(`no figure ${name}`); return e; }
}

/** A native object instance of a library figure: rotation adds to every angle (fan figures rotate about the root). */
export function instance(entry, {x, y, rot = 0, scale = 1, opacity = 1, angles, lengths, flipX = false, color} = {}) {
  let a = angles ?? entry.angles;
  if (rot || flipX) a = a.map(v => { const w = v + rot; return flipX ? Math.PI - w : w; });
  const object = {
    figure_type_id: entry.id, root_x: x, root_y: y, scale,
    color_override_raw: 0, field28: Math.round((1 - Math.max(0, Math.min(1, opacity))) * 255),
    angles: a.map(v => Math.atan2(Math.sin(v), Math.cos(v))),
    len_flag: lengths ? lengths.length : 0, lengths: lengths ?? [],
    bend_flag: 0, bends: [], join: null,
  };
  if (flipX) {
    const segs = entry.type.segments;
    object.bend_flag = segs.length; object.bends = segs.map(s => -(s.bend_rad ?? 0));
  }
  if (color) {
    const [r, g, b] = rgbOf(color);
    object.color_override_raw = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    object.color_override_rgb = [r, g, b]; object.color_override_mix = 255;
  }
  return object;
}

export const radial = stops => ({type: 'radial', angle: 0, stops: stops.map(([offset, color, opacity]) => ({offset, color: rgbOf(color), opacity}))});
export const linear = (angle, stops) => ({type: 'linear', angle, stops: stops.map(([offset, color, opacity]) => ({offset, color: rgbOf(color), opacity}))});
