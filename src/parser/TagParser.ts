import type { LineTags, SetOp, StateKey, StateOp, Transition } from '../types/script';

import { intRect, parseClip } from './ClipParser';
import type { KaraTag } from './KaraokeTracker';
import { lexOverrides, type RawTag } from './TagLexer';
import { legacyToNumpad, parseAlphaTag, parseColorTag, parseNum, parseNumList, splitArgs } from './TagValues';

export interface ParsedBlock {
  /** Ordered state operations (sets, transitions, resets). */
  ops: StateOp[];
  /** Line-level tags (first/last-wins already applied inside the block). */
  line: LineTags;
  kara: KaraTag[];
  /** Last `\p` level in the block, if any. */
  drawing?: number;
  unknown: string[];
}

const NUM_KEYS = new Set<string>([
  'fscx', 'fscy', 'fsp', 'frx', 'fry', 'frz', 'fax', 'fay', 'xbord', 'ybord', 'xshad', 'yshad', 'blur', 'be', 'pbo',
]);
const BOOL_KEYS = new Set<string>(['i', 'u', 's']);
const NON_NEGATIVE = new Set<string>(['xbord', 'ybord', 'blur', 'be', 'fscx', 'fscy']);

const set = (key: StateKey, value: number | string | null, relative?: boolean): SetOp =>
  relative ? { type: 'set', key, value, relative } : { type: 'set', key, value };

/** libass limits: `\blur` 0..100 (`BLUR_MAX_RADIUS`), the others in `NON_NEGATIVE` >= 0. */
const clampNum = (key: string, v: number | null): number | null => {
  if (v === null) return null;
  const n = NON_NEGATIVE.has(key) ? Math.max(0, v) : v;
  return key === 'blur' ? Math.min(100, n) : n;
};

/** Tags that change the text state; returns false when `tag` is not a state tag. */
const stateOps = (tag: RawTag, ops: SetOp[]): boolean => {
  const name = tag.name!;
  const arg = tag.arg;
  if (NUM_KEYS.has(name)) ops.push(set(name as StateKey, clampNum(name, parseNum(arg))));
  else if (name === 'fr') ops.push(set('frz', parseNum(arg)));
  else if (name === 'fs') {
    const v = parseNum(arg);
    ops.push(set('fs', v, v !== null && /^\s*[+-]/.test(arg)));
  } else if (name === 'bord' || name === 'shad') {
    const v = parseNum(arg);
    const val = v === null ? null : Math.max(0, v);
    const [x, y] = name === 'bord' ? (['xbord', 'ybord'] as const) : (['xshad', 'yshad'] as const);
    ops.push(set(x, val), set(y, val));
  } else if (name === 'b') ops.push(set('b', parseNum(arg)));
  else if (BOOL_KEYS.has(name)) ops.push(set(name as StateKey, parseNum(arg)));
  else if (name === 'fn') ops.push(set('fn', arg.trim() || null));
  else if (name === 'c' || /^[1-4]c$/.test(name)) ops.push(set(`c${name === 'c' ? 1 : name[0]}` as StateKey, parseColorTag(arg)));
  else if (name === 'alpha') {
    const a = parseAlphaTag(arg);
    ops.push(set('a1', a), set('a2', a), set('a3', a), set('a4', a));
  } else if (/^[1-4]a$/.test(name)) ops.push(set(`a${name[0]}` as StateKey, parseAlphaTag(arg)));
  else return false;
  return true;
};

/** `\t([t1,t2,][accel,]\tags)`; malformed => null. */
export const parseTransition = (arg: string): Transition | null => {
  const idx = arg.indexOf('\\');
  if (idx === -1) return null;
  const prefix = arg.slice(0, idx).replace(/,\s*$/, '').trim();
  const nums = prefix === '' ? [] : splitArgs(prefix).map(parseNum);
  if (nums.length > 3 || nums.includes(null)) return null;
  const n = nums as number[];
  const tr: Transition = {
    type: 't',
    t1: n.length >= 2 ? n[0] : 0,
    t2: n.length >= 2 ? n[1] : null,
    accel: n.length === 1 ? n[0] : n.length === 3 ? n[2] : 1,
    ops: [],
  };
  for (const tag of lexOverrides(arg.slice(idx))) {
    if (!tag.name || tag.name === 't') continue; // nested \t is ignored (libass)
    if (tag.name === 'clip' || tag.name === 'iclip') {
      const nl = parseNumList(tag.arg);
      if (nl && nl.length === 4) tr.clip = intRect(nl);
    } else stateOps(tag, tr.ops);
  }
  return tr;
};

/** Line-level tags; returns false when `tag` is not one. */
const lineTag = (tag: RawTag, line: LineTags): boolean => {
  const name = tag.name!;
  const nums = name === 'pos' || name === 'move' || name === 'org' || name === 'fad' || name === 'fade'
    ? parseNumList(tag.arg) : null;
  const positioned = line.pos !== undefined || line.move !== undefined;
  const faded = line.fad !== undefined || line.fade !== undefined;
  switch (name) {
    case 'pos': if (nums?.length === 2 && !positioned) line.pos = [nums[0], nums[1]]; return true;
    case 'move': if ((nums?.length === 4 || nums?.length === 6) && !positioned) line.move = nums; return true;
    case 'org': if (nums?.length === 2 && !line.org) line.org = [nums[0], nums[1]]; return true;
    case 'fad': if (nums?.length === 2 && !faded) line.fad = [nums[0], nums[1]]; return true;
    case 'fade': if (nums?.length === 7 && !faded) line.fade = nums; return true;
    case 'clip': case 'iclip': {
      const c = parseClip(tag.arg, name === 'iclip');
      if (c?.drawing !== undefined) line.vclip ??= c; // libass: the first vector clip wins
      else if (c) line.clip = c; // the last rect clip wins
      return true;
    }
    case 'an': {
      const n = parseNum(tag.arg);
      if (line.an === undefined && n !== null && Number.isInteger(n) && n >= 1 && n <= 9) line.an = n;
      return true;
    }
    case 'a': {
      const n = legacyToNumpad(parseNum(tag.arg) ?? NaN);
      if (line.an === undefined && n !== null) line.an = n;
      return true;
    }
    case 'q': {
      const n = parseNum(tag.arg);
      if (n !== null && Number.isInteger(n) && n >= 0 && n <= 3) line.q = n;
      return true;
    }
    default: return false;
  }
};

/** Parses the CONTENT of one override block (braces optional). */
export const parseBlock = (block: string): ParsedBlock => {
  const content = block.startsWith('{') && block.endsWith('}') ? block.slice(1, -1) : block;
  const out: ParsedBlock = { ops: [], line: {}, kara: [], unknown: [] };
  for (const tag of lexOverrides(content)) {
    const name = tag.name;
    if (!name) out.unknown.push(tag.raw);
    else if (name === 't') {
      const tr = parseTransition(tag.arg);
      if (tr) out.ops.push(tr);
      else out.unknown.push(tag.raw);
    } else if (name === 'r') out.ops.push({ type: 'r', style: tag.arg.trim() || null });
    else if (name === 'k' || name === 'K' || name === 'kf' || name === 'ko' || name === 'kt') {
      const cs = Math.max(0, parseNum(tag.arg) ?? 0);
      out.kara.push({ type: name === 'K' ? 'kf' : name, cs });
    } else if (name === 'p') out.drawing = Math.max(0, Math.floor(parseNum(tag.arg) ?? 0));
    else if (name === 'fe') continue; // font encoding: no effect in browsers
    else if (!lineTag(tag, out.line)) {
      const ops: SetOp[] = [];
      if (stateOps(tag, ops)) out.ops.push(...ops);
      else out.unknown.push(tag.raw);
    }
  }
  return out;
};
