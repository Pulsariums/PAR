import type { Num } from '../format/num';
import { TAGS } from '../format/tagTable';
import { printText, type Tag } from '../format/textModel';

import type { OptEvent, Part } from './events';
import type { Line } from './fit';
import { allowed, FIT_SHARE, type Geo, type Kind } from './tolerance';
import type { OptimizeMode } from './types';

const MOVE = TAGS.find((t) => t.name === 'move')!.id;
const valueAt = (l: Line, t: number): number => l.v0 + l.slope * (t - l.t0);
const WIDTH: Record<Part['how'], number> = { const: 0, pos: 2, num: 1, colour: 3, alpha: 1 };
const int = (v: number): Num => ({ m: Math.round(v), d: 0 });

/** Shortest decimal (up to 3 places) within `tol` of `v`: short numbers keep the optimised file small. */
const num = (v: number, tol: number): Num => {
  for (let d = 0; d <= 3; d++) {
    const m = Math.round(v * 10 ** d);
    if (Math.abs(m / 10 ** d - v) <= tol) return { m, d };
  }
  return { m: Math.round(v * 1000), d: 3 };
};

const level = (v: number): number => Math.min(255, Math.max(0, Math.round(v)));

/**
 * The Text field of one merged event: the first event's block with every number that moved written as its value at the first frame it is
 * judged on, and a `\t` (or `\move` for the position) to its value at the last frame, timed between those two instants (absolute ms;
 * the event starts at `startMs`). Outside them the value simply holds: nothing is extrapolated past the frames that were seen, so
 * numbers with a range (alpha, colour channels) never need clamping. Numbers that did not move stay as written.
 */
export const emitText = (evs: readonly OptEvent[], lines: readonly Line[], startMs: number, from: number, to: number, geo: Geo, mode: OptimizeMode): string => {
  const head = evs[0];
  const t1 = int(from - startMs), t2 = int(to - startMs);
  const moved = (p: Part): boolean => {
    for (let k = 0; k < WIDTH[p.how]; k++) if (evs.some((e) => e.vals[p.at + k] !== head.vals[p.at + k])) return true;
    return false;
  };
  // What the fit did not spend is the budget for rounding the written numbers.
  const room = (kind: Kind, v: number): number => allowed(kind, v, geo, mode) * (1 - FIT_SHARE);
  const tags: Tag[] = [];
  const anim: Tag[] = [];
  for (const p of head.parts) {
    if (p.how === 'const' || !moved(p)) { tags.push(p.tag); continue; }
    const s = p.at;
    const both = (k: number): [number, number] => [valueAt(lines[s + k], from), valueAt(lines[s + k], to)];
    if (p.how === 'pos') {
      const [x1, x2] = both(0), [y1, y2] = both(1);
      tags.push({ k: 'n', id: MOVE, nums: [num(x1, room('pos', x1)), num(y1, room('pos', y1)), num(x2, room('pos', x2)), num(y2, room('pos', y2)), t1, t2] });
    } else if (p.tag.k === 'n') {
      const [a, b] = both(0);
      tags.push({ ...p.tag, nums: [num(a, room(head.kinds[s], a))] });
      anim.push({ ...p.tag, nums: [num(b, room(head.kinds[s], b))] });
    } else if (p.tag.k === 'h') {
      const pack = (t: number): number => (p.how === 'colour' ? [0, 1, 2].reduce((m, c) => m | (level(valueAt(lines[s + c], t)) << (8 * c)), 0) >>> 0 : level(valueAt(lines[s], t)));
      tags.push({ ...p.tag, n: { m: pack(from), d: 0 } });
      anim.push({ ...p.tag, n: { m: pack(to), d: 0 } });
    } else tags.push(p.tag);
  }
  if (anim.length) tags.push({ k: 't', nums: [t1, t2], tags: anim });
  return printText([{ k: 'blk', pre: '', tags }, { k: 'lit', s: head.text }]);
};
