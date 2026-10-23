// Native StykAnimate effect clips (the app's VFX timeline) for the scene and figures.
import {VFX_REGISTRY} from '../../../src/vfx-registry.mjs';

const defaults = type => Object.fromEntries(Object.entries(VFX_REGISTRY[type].params).map(([k, d]) => [k, d.default]));
let seq = 0;
export function effect(type, params = {}) {
  return {version: 2, id: `${type}-${++seq}`, type, enabled: true, params: {...defaults(type), ...params}};
}
/**
 * clip({name, target, start, duration, effects, keys: {effectIndex: {param: [[tick, value, interpolation?]]}}, fadeIn, fadeOut, strength})
 * Key ticks are absolute; they are stored relative to the clip start.
 */
export function clip({name, target, start = 0, duration = null, effects, keys = {}, fadeIn = 0, fadeOut = 0, strength = 1, includeAttached = true}) {
  const out = {};
  for (const [index, params] of Object.entries(keys)) {
    const fx = effects[Number(index)];
    for (const [param, list] of Object.entries(params))
      out[`vfx1:${fx.type}:${fx.id}:${param}`] = list.map(([tick, value, interpolation = 'linear']) => ({tick: tick - start, value, interpolation}));
  }
  return {id: `clip-${++seq}`, name, target, start, duration, offset: 0, enabled: true, strength, fadeIn, fadeOut, includeAttached: target.kind === 'scene' ? false : includeAttached, effects, keys: out};
}
