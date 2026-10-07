import { modelFields, type ModelEvent } from '../format/chunk';
import { numValue } from '../format/num';
import { TAG_BY_ID } from '../format/tagTable';
import { parseTextModel, printTag, type Tag } from '../format/textModel';

import type { Kind } from './tolerance';

/** Tags whose number a `\t` can interpolate and that this tool fits (name => kind). */
const NUM_KIND: Record<string, Kind> = {
  fscx: 'scale', fscy: 'scale', fsp: 'spacing', fs: 'fs', frx: 'angle', fry: 'angle', frz: 'angle', fax: 'shear', fay: 'shear',
  xbord: 'len', ybord: 'len', bord: 'len', xshad: 'len', yshad: 'len', shad: 'len', blur: 'blur', be: 'blur',
};
const COLOURS = new Set(['c', '1c', '2c', '3c', '4c']);
const ALPHAS = new Set(['alpha', '1a', '2a', '3a', '4a']);
/** Tags that animate or depend on the event's own duration: their events are not frame-by-frame copies. */
const TIMED = new Set(['t', 'move', 'fad', 'fade', 'k', 'kf', 'ko', 'kt', 'K', 'p']);

/** One tag of the leading override block and how it takes part. */
export interface Part {
  tag: Tag;
  /** Where its numbers sit in `vals` (-1: a constant). */
  at: number;
  /** `pos` (two numbers), `num`, `colour` (three channels) or `alpha`. */
  how: 'const' | 'pos' | 'num' | 'colour' | 'alpha';
}

/** A Dialogue line that looks like one frame of frame-by-frame typesetting: one override block, then plain text. */
export interface OptEvent {
  /** Line index in the file. */
  line: number;
  m: ModelEvent;
  parts: Part[];
  text: string;
  /** Values of the fitted numbers, in tag order. */
  vals: number[];
  kinds: Kind[];
  /** Events with the same key can be copies of one another. */
  key: string;
}

const channels = (bgr: number): number[] => [bgr & 255, (bgr >> 8) & 255, (bgr >> 16) & 255];

/** Line => event, or null when it is not a candidate (not canonical, animated, several blocks, drawing, empty). */
export const toOptEvent = (line: string, index: number): OptEvent | null => {
  const m = modelFields(line, false);
  if (!m) return null;
  const segs = parseTextModel(m.text);
  if (segs.length !== 2 || segs[0].k !== 'blk' || segs[0].pre !== '' || segs[1].k !== 'lit' || segs[1].s === '') return null;
  const parts: Part[] = [];
  const vals: number[] = [];
  const kinds: Kind[] = [];
  const key: string[] = [`${m.layer}|${m.style}|${m.name}|${m.ml},${m.mr},${m.mv}|${m.effect}`];
  for (const tag of segs[0].tags) {
    if (tag.k === 't') return null;
    if (tag.k === 'v') { parts.push({ tag, at: -1, how: 'const' }); key.push(tag.raw); continue; }
    const name = tag.k === 'c' ? TAG_BY_ID[tag.id]!.name : TAG_BY_ID[tag.id]!.name;
    if (TIMED.has(name)) return null;
    if (tag.k === 'n' && name === 'pos') {
      parts.push({ tag, at: vals.length, how: 'pos' });
      vals.push(numValue(tag.nums[0]), numValue(tag.nums[1]));
      kinds.push('pos', 'pos');
      key.push('\\pos');
    } else if (tag.k === 'n' && NUM_KIND[name] && tag.nums.length === 1) {
      parts.push({ tag, at: vals.length, how: 'num' });
      vals.push(numValue(tag.nums[0]));
      kinds.push(NUM_KIND[name]);
      key.push(`\\${name}#`);
    } else if (tag.k === 'h' && tag.digits > 0 && COLOURS.has(name)) {
      parts.push({ tag, at: vals.length, how: 'colour' });
      vals.push(...channels(tag.n.m));
      kinds.push('chan', 'chan', 'chan');
      key.push(`\\${name}/${tag.digits}`);
    } else if (tag.k === 'h' && tag.digits > 0 && ALPHAS.has(name)) {
      parts.push({ tag, at: vals.length, how: 'alpha' });
      vals.push(tag.n.m);
      kinds.push('alpha');
      key.push(`\\${name}/${tag.digits}`);
    } else {
      parts.push({ tag, at: -1, how: 'const' });
      key.push(printTag(tag));
    }
  }
  key.push(segs[1].s);
  return { line: index, m, parts, text: segs[1].s, vals, kinds, key: key.join('\u0001') };
};
