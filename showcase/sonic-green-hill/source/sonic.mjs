// Posing layer for the community library's "Archie Sonic" figure set (Mr.Legend3x).
// The figure is 41 native figures joined into one assembly. Native segment angles are
// absolute, so a body part is rotated by adding the same delta to every segment of every
// figure in that part; joined roots follow their parents' handles automatically.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readNativeDocument} from '../../../scripts/read-native-document.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// "Archie Sonic" by Mr.Legend3x, downloaded unchanged from the StykAnimate community library.
const source = await readNativeDocument(path.join(here, '../archie-sonic.stkz'));

export const sonicFigureTypes = source.figure_types;
const rest = source.keyframes[0].objects;
const typeById = new Map(source.figure_types.map(t => [t.figure_type_id, t]));

// Body parts: the figures they contain and the part they hang from. Pivots are the
// native join handles, so a part rotates about the joint it is attached to.
export const PARTS = {
  torso: {slots: [18], parent: 'root'},
  head: {slots: [30, 17, 23, 33, 31, 32], parent: 'torso'},
  tail: {slots: [34], parent: 'torso'},
  // Near arm (drawn in front of the body).
  nUpper: {slots: [37], parent: 'torso'},
  nFore: {slots: [36], parent: 'nUpper'},
  nHand: {slots: [35, 38, 39], parent: 'nFore'},
  // Far arm (drawn behind the body).
  fUpper: {slots: [2], parent: 'torso'},
  fFore: {slots: [1], parent: 'fUpper'},
  fHand: {slots: [0, 3, 4], parent: 'fFore'},
  // Near leg.
  nThigh: {slots: [21], parent: 'root'},
  nShin: {slots: [22], parent: 'nThigh'},
  nFoot: {slots: [24, 16, 25, 26, 27, 28, 20, 19, 29], parent: 'nShin'},
  // Far leg hangs from a short invisible hip line.
  hip: {slots: [40], parent: 'root'},
  fThigh: {slots: [15], parent: 'hip'},
  fShin: {slots: [8], parent: 'fThigh'},
  fFoot: {slots: [9, 5, 10, 11, 12, 13, 7, 6, 14], parent: 'fShin'},
};
const ORDER = Object.keys(PARTS);
const partOf = new Map();
for (const [name, part] of Object.entries(PARTS)) for (const slot of part.slots) partOf.set(slot, name);
if (partOf.size !== rest.length) throw new Error(`Sonic rig covers ${partOf.size} of ${rest.length} figures`);

export const REST_ANGLE = Object.fromEntries(ORDER.map(name => [name, rest[PARTS[name].slots[0]].angles[0]]));
const lengthOf = slot => rest[slot].len_flag ? rest[slot].lengths[0] : sonicFigureTypes.find(t => t.figure_type_id === rest[slot].figure_type_id).segments[0].length;
export const BONE = {
  thigh: lengthOf(21), shin: lengthOf(22), farThigh: lengthOf(15), farShin: lengthOf(8),
  upper: lengthOf(37), fore: lengthOf(36), farUpper: lengthOf(2), farFore: lengthOf(1),
};
// Rest measurements (scale 1, relative to the hip, y down).
export const REST = {
  hip: {x: rest[18].root_x, y: rest[18].root_y},
  ground: 324.6 - rest[18].root_y, // hip height above the soles
  ankleHeight: 324.6 - 282.6,      // ankle above the sole
  nAnkle: {x: 390.6 - 412.6, y: 282.4 - 198.7},
  fAnkle: {x: 433.7 - 412.6, y: 282.9 - 198.7},
  farHip: {x: 3.32, y: 0},
  nShoulder: {x: 409.2 - 412.6, y: 148.2 - 198.7},
  fShoulder: {x: 424.3 - 412.6, y: 150.4 - 198.7},
  neck: {x: 418.5 - 412.6, y: 140.5 - 198.7},
};

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/** Two-bone IK in the character's own frame (facing right, y down). bend +1 = joint toward +x. */
export function ik2(base, target, l1, l2, bend = 1) {
  const dx = target.x - base.x, dy = target.y - base.y;
  const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
  const phi = Math.atan2(dy, dx);
  const alpha = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const a1 = phi - bend * alpha;
  const joint = {x: base.x + l1 * Math.cos(a1), y: base.y + l1 * Math.sin(a1)};
  const a2 = Math.atan2(target.y - joint.y, target.x - joint.x);
  return [a1, a2, joint];
}

/**
 * pose: {x, y, rot, flip, scale, opacity, hidden: Set<part>, partOpacity: {part: 0..1},
 *        <part>: local delta (rad), abs: {<part>: angle in character frame},
 *        legs: {near: {x,y,tilt}, far: {x,y,tilt}} ankle targets relative to hip (scale 1 units),
 *        arms: {near: {x,y}, far: {x,y}} wrist targets relative to hip}
 * Returns native objects with local slots 0..40 (joins refer to local slots).
 */
export function sonicObjects(pose) {
  const s = pose.scale ?? 1;
  const abs = {...(pose.abs ?? {})};
  const leg = (key, hipOffset, thigh, shin, thighPart, shinPart, footPart) => {
    const t = pose.legs?.[key]; if (!t) return;
    const [a1, a2] = ik2(hipOffset, t, thigh, shin, t.bend ?? 1);
    abs[thighPart] = a1; abs[shinPart] = a2;
    if (t.tilt !== undefined) abs[footPart] = REST_ANGLE[footPart] + t.tilt;
  };
  leg('near', {x: 0, y: 0}, BONE.thigh, BONE.shin, 'nThigh', 'nShin', 'nFoot');
  leg('far', REST.farHip, BONE.farThigh, BONE.farShin, 'fThigh', 'fShin', 'fFoot');
  const torsoDelta = (abs.torso !== undefined ? abs.torso - REST_ANGLE.torso : pose.torso ?? 0);
  const rotP = (p, a) => ({x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a)});
  const arm = (key, shoulder, upper, fore, upperPart, forePart, handPart) => {
    const t = pose.arms?.[key]; if (!t) return;
    const base = rotP(shoulder, torsoDelta);
    const [a1, a2] = ik2(base, t, upper, fore, t.bend ?? -1);
    abs[upperPart] = a1; abs[forePart] = a2;
    if (t.tilt !== undefined) abs[handPart] = REST_ANGLE[handPart] + t.tilt;
  };
  arm('near', REST.nShoulder, BONE.upper, BONE.fore, 'nUpper', 'nFore', 'nHand');
  arm('far', REST.fShoulder, BONE.farUpper, BONE.farFore, 'fUpper', 'fFore', 'fHand');

  const delta = {root: 0};
  for (const name of ORDER) {
    const part = PARTS[name];
    delta[name] = abs[name] !== undefined ? abs[name] - REST_ANGLE[name] : delta[part.parent] + (pose[name] ?? 0);
  }
  const rot = pose.rot ?? 0, flip = Boolean(pose.flip);
  const opacity = pose.opacity ?? 1;
  return rest.map((object, slot) => {
    const name = partOf.get(slot);
    let alpha = opacity * (pose.partOpacity?.[name] ?? 1);
    if (pose.hidden?.has?.(name)) alpha = 0;
    const angles = object.angles.map(a => {
      const v = a + delta[name] + rot;
      return wrap(flip ? Math.PI - v : v);
    });
    const next = {
      ...structuredClone(object),
      angles,
      scale: s,
      field28: Math.round((1 - Math.max(0, Math.min(1, alpha))) * 255),
    };
    delete next.record_offset; delete next.record_end; delete next.transparency; delete next.opacity;
    if (flip) {
      const segments = typeById.get(object.figure_type_id).segments;
      next.bends = segments.map((segment, i) => -(object.bend_flag ? (object.bends[i] ?? 0) : (segment.bend_rad ?? 0)));
      next.bend_flag = next.bends.length;
    }
    if (!object.join) { next.root_x = pose.x; next.root_y = pose.y; }
    return next;
  });
}
