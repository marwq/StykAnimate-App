// Assembles the project: native frames are the pose sources, and a layer exposure
// sheet (the app's own timeline model) shows them. Static scenery lives only in the
// first native frame and is held by a single key on its layer; animated layers have
// one key per output frame.

const round = (v, p) => { const m = 10 ** p; const r = Math.round(v * m) / m; return Object.is(r, -0) ? 0 : r; };
/** Rounds pose numbers to well below a pixel so the document stays compact. */
function compact(o) {
  o.root_x = round(o.root_x, 2); o.root_y = round(o.root_y, 2); o.scale = round(o.scale, 4);
  o.angles = o.angles.map(v => round(v, 5));
  if (o.lengths?.length) o.lengths = o.lengths.map(v => round(v, 3));
  if (o.bends?.length) o.bends = o.bends.map(v => round(v, 5));
  return o;
}

/**
 * layers: [{id, name, parallax?: number, static?: boolean}] bottom to top.
 * staticItems: [{layer, uid, object}] (no joins).
 * dynamic(tick) -> [{layer, uidBase, objects (local slots and joins), zIndex?}]
 * camera(tick) -> {x, y, scale, angle_rad}
 */
export function assemble({name, width, height, fps, ticks, figureTypes, backgrounds, layers: semantic, staticItems, dynamic, camera, reference}) {
  // Semantic layer keys map to the app's user layer ids (layer-1 is the bottom layer).
  const layers = semantic.map((layer, i) => ({...layer, id: `layer-${i + 1}`}));
  const idOf = new Map(layers.map(l => [l.key, l.id]));
  const layerId = key => { const id = idOf.get(key); if (!id) throw new Error(`unknown layer ${key}`); return id; };
  staticItems = staticItems.map(item => ({...item, layer: layerId(item.layer)}));
  const assignments = {};
  const frames = [];
  for (let tick = 0; tick < ticks; tick++) {
    const objects = [];
    const add = (layer, object, uid) => {
      const slot = objects.length;
      objects.push(compact({...object, object_slot: slot, unique_id: uid}));
      const prior = assignments[String(uid)];
      if (prior && prior !== layer) throw new Error(`uid ${uid} on two layers (${prior}, ${layer})`);
      assignments[String(uid)] = layer;
      return slot;
    };
    const ordered = [];
    for (const group of dynamic(tick)) ordered.push({...group, layer: layerId(group.layer)});
    // Objects are listed layer by layer (bottom to top) so slot order is draw order.
    const byLayer = new Map(layers.map(l => [l.id, []]));
    if (tick === 0) for (const item of staticItems) byLayer.get(item.layer).push({kind: 'static', item});
    for (const group of ordered) {
      if (!byLayer.has(group.layer)) throw new Error(`unknown layer ${group.layer}`);
      byLayer.get(group.layer).push({kind: 'group', group});
    }
    for (const layer of layers) for (const entry of byLayer.get(layer.id)) {
      if (entry.kind === 'static') { add(layer.id, {...entry.item.object, join: null}, entry.item.uid); continue; }
      const {group} = entry, base = objects.length;
      group.objects.forEach((object, local) => {
        const next = {...object};
        if (object.join) next.join = {target_object_slot: base + object.join.target_object_slot, target_unique_id: group.uidBase + object.join.target_object_slot, target_handle_id: object.join.target_handle_id};
        else next.join = null;
        if (group.zIndex !== undefined) next._stykZIndex = group.zIndex; else if (next._stykZIndex === undefined) delete next._stykZIndex;
        add(layer.id, next, group.uidBase + local);
      });
    }
    const cam = camera(tick);
    frames.push({
      duration_raw: 1,
      background_id: 1, background_id_b: 0, background_mix: 0,
      camera: {is_default: false, x: cam.x, y: cam.y, scale: cam.scale, angle_rad: cam.angle_rad ?? 0},
      objects,
      object_draw_order: objects.map((_, i) => i),
      object_draw_order_unique_ids: objects.map(o => o.unique_id),
      _styk: {frameId: `frame-${tick + 1}`},
    });
  }
  let cell = 0;
  const keysEvery = (extra) => Array.from({length: ticks}, (_, tick) => ({id: `cell-${++cell}`, tick, sourceTick: tick, interpolation: 'linear', ...extra}));
  const tracks = {scene: {end: ticks, keys: keysEvery({})}, camera: {end: ticks, keys: keysEvery({})}};
  for (const layer of layers) tracks[layer.id] = {end: ticks, keys: layer.static
    ? [{id: `cell-${++cell}`, tick: 0, sourceTick: 0, interpolation: 'constant', empty: false}]
    : keysEvery({empty: false})};
  const byId = {};
  for (const layer of layers) {
    byId[layer.id] = {name: layer.name, visible: true, locked: Boolean(layer.locked)};
    if (layer.color) byId[layer.id].color = layer.color;
    if (layer.parallax !== undefined && layer.parallax !== 1)
      byId[layer.id].parallax = {enabled: true, linked: true, x: layer.parallax, y: layer.parallax, reference: {x: reference.x, y: reference.y}};
  }
  const sonicLayer = layers.find(l => l.key === 'sonic') ?? layers.at(-1);
  return {
    version: 5,
    canvas_width: width, canvas_height: height, fps,
    auto_easing: false, auto_easing_disabled_raw: 1,
    backgrounds, figure_types: figureTypes, keyframes: frames,
    _styk: {
      format: 'StykAnimate', format_version: 1, name,
      layers: {version: 1, nextId: layers.length + 1, order: layers.map(l => l.id), byId, assignments, defaultLayerId: sonicLayer.id, activeId: sonicLayer.id, fixed: {scene: {visible: true, locked: false}, camera: {visible: true, locked: false}}},
      layerSheet: {version: 1, duration: ticks, nextId: cell + 1, tracks},
    },
  };
}
