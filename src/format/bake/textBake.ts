import { fadeAlphaAt, positionAt } from '../../anim/LineAnim';
import { transitionProgress } from '../../anim/State';
import { numValue, roundTo, type Num } from '../num';
import { matchTag, TAGS, TAG_BY_ID, TAG_P } from '../tagTable';
import { parseTextModel, printText, type Draw, type Seg, type Tag } from '../textModel';

import type { Quanta } from './params';

const id = (name: string): number => TAGS.find((t) => t.name === name)!.id;
const ID = {
  pos: id('pos'), org: id('org'), move: id('move'), clip: id('clip'), iclip: id('iclip'), fad: id('fad'), fade: id('fade'),
  fe: id('fe'),
};
const ANGLE = new Set(['frx', 'fry', 'frz', 'fr']);
const LENGTH = new Set(['bord', 'xbord', 'ybord', 'shad', 'xshad', 'yshad']);
const KARA = new Set(['k', 'kf', 'ko', 'kt', 'K']);
const UNCONDITIONAL = new Set([id('b'), id('i'), id('u'), id('s')]);

export interface BakeCtx {
  q: Quanta;
  maxScale: number;
  /** Sample time relative to the ORIGINAL line start (ms) and the original duration (ms); null = more than one frame. */
  single: { rel: number; dur: number } | null;
}

/** True when the line has tags that depend on time and could not be baked away. */
export interface BakeResult {
  text: string;
  animated: boolean;
  positioned: boolean;
}

const round = (n: Num, q: number): Num => roundTo(n, q);
const fromValue = (v: number): Num => {
  const d = 6;
  return { m: Math.round(v * 10 ** d), d };
};

const quantNums = (t: Extract<Tag, { k: 'n' }>, name: string, c: BakeCtx): void => {
  const q = c.q;
  const f = (qq: number): void => void (t.nums = t.nums.map((n) => round(n, qq)));
  if (t.id === ID.pos || t.id === ID.org || t.id === ID.clip || t.id === ID.iclip) f(q.pos);
  else if (t.id === ID.move) t.nums = t.nums.map((n, i) => (i < 4 ? round(n, q.pos) : n));
  else if (name === 'fscx' || name === 'fscy') f(q.scale);
  else if (name === 'fs' && t.nums.length && !(numValue(t.nums[0]) < 0)) f(q.fs(numValue(t.nums[0])));
  else if (name === 'fsp') f(q.spacing);
  else if (name === 'fax' || name === 'fay') f(q.shear);
  else if (name === 'blur' || name === 'be') f(q.blur);
  else if (ANGLE.has(name)) f(q.angle);
  else if (LENGTH.has(name)) f(q.pos);
};

const quantDraw = (d: Draw, level: number, c: BakeCtx): void => {
  const q = c.q.draw(Math.max(level, 1), c.maxScale);
  for (const g of d.groups) g.nums = g.nums.map((n) => round(n, q));
};

/** `\t` progress at the single sample, using PAR's own interpolation (null = cannot be resolved). */
const resolveT = (t: Extract<Tag, { k: 't' }>, c: BakeCtx): 'drop' | 'inline' | null => {
  if (!c.single) return null;
  // `\b \i \u \s \fn \r` inside `\t` apply at any progress (libass): never drop or fold them.
  if (t.tags.some((x) => x.k === 's' || (x.k === 'n' && UNCONDITIONAL.has(x.id)))) return null;
  const a = t.nums.map(numValue);
  const tr = a.length === 0 ? { t1: 0, t2: null, accel: 1 } : a.length === 1 ? { t1: 0, t2: null, accel: a[0] } : { t1: a[0], t2: a[1], accel: a.length === 3 ? a[2] : 1 };
  const k = transitionProgress({ type: 't', ...tr, ops: [] }, c.single.rel, c.single.dur);
  if (k <= 0) return 'drop';
  const hasClip = t.tags.some((x) => x.k === 'n' && (x.id === ID.clip || x.id === ID.iclip));
  return k >= 1 && !hasClip ? 'inline' : null;
};

const walk = (tags: Tag[], c: BakeCtx, out: { animated: boolean; positioned: boolean }, depth: number): Tag[] => {
  const res: Tag[] = [];
  for (const t of tags) {
    if (t.k === 'v') {
      if (matchTag(t.raw.slice(1)) === null) continue; // unknown tag: PAR ignores it
      out.animated ||= /\\(?:t|k|K|fad|move)/.test(t.raw);
      res.push(t);
    } else if (t.k === 'n') {
      const def = TAG_BY_ID[t.id]!;
      if (t.id === ID.fe) continue;
      if (t.id === ID.move && c.single) {
        const m = t.nums.map(numValue);
        const p = positionAt({ move: m }, c.single.rel, c.single.dur)!;
        res.push({ k: 'n', id: ID.pos, nums: [fromValue(p[0]), fromValue(p[1])] });
        out.positioned = true;
        continue;
      }
      if ((t.id === ID.fad || t.id === ID.fade) && c.single) {
        const m = t.nums.map(numValue);
        const a = fadeAlphaAt(t.id === ID.fad ? { fad: [m[0], m[1]] } : { fade: m }, c.single.rel, c.single.dur);
        if (a === 0) continue;
      }
      if (KARA.has(def.name) || t.id === ID.move || t.id === ID.fad || t.id === ID.fade) out.animated = true;
      if (t.id === ID.pos || t.id === ID.move) out.positioned = true;
      quantNums(t, def.name, c);
      res.push(t);
    } else if (t.k === 't') {
      const r = depth === 0 ? resolveT(t, c) : null;
      if (r === 'drop') continue;
      if (r === 'inline') res.push(...walk(t.tags, c, out, depth + 1));
      else {
        out.animated = true;
        t.nums = t.nums.map((n) => n);
        t.tags = walk(t.tags, { ...c, single: null }, { animated: false, positioned: false }, depth + 1);
        res.push(t);
      }
    } else {
      if (t.k === 'c') quantDraw(t.draw, 1, c);
      res.push(t);
    }
  }
  return res;
};

/** Bake one Text field: quantize numbers, drop ignored tags, collapse animations of one-frame lines. */
export const bakeText = (text: string, c: BakeCtx): BakeResult => {
  const segs = parseTextModel(text);
  const flags = { animated: false, positioned: false };
  let level = 0;
  const out: Seg[] = [];
  for (const g of segs) {
    if (g.k === 'blk') {
      const tags = walk(g.tags, c, flags, 0);
      for (const t of tags) if (t.k === 'n' && t.id === TAG_P) level = t.nums.length ? Math.max(0, Math.trunc(numValue(t.nums[0]))) : 0;
      if (tags.length) out.push({ k: 'blk', pre: '', tags });
    } else if (g.k === 'draw') {
      quantDraw(g.d, level, c);
      out.push(g);
    } else out.push(g);
  }
  return { text: printText(out), animated: flags.animated, positioned: flags.positioned };
};
