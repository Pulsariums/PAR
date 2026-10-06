import { fmtNum, parseNum, type Num } from './num';
import { matchTag, TAG_P, TAG_T, TAG_BY_ID, VERB_ID, type TagDef } from './tagTable';

/** Lossless structured view of an event's Text field. `printText(parseText(s)) === s` is enforced, never assumed. */
export interface DrawGroup {
  cmd: string;
  nums: Num[];
}
export interface Draw {
  groups: DrawGroup[];
  trail: boolean;
}
export type Tag =
  | { k: 'v'; raw: string }
  | { k: 'n'; id: number; nums: Num[] }
  | { k: 'h'; id: number; n: Num; digits: number }
  | { k: 's'; id: number; s: string }
  | { k: 'c'; id: number; scale: Num | null; draw: Draw }
  | { k: 't'; nums: Num[]; tags: Tag[] };
export type Seg =
  | { k: 'lit'; s: string }
  | { k: 'draw'; d: Draw }
  | { k: 'blk'; pre: string; tags: Tag[] };

const MAX_DEPTH = 3;
const CMDS = 'mnlbspc';

export const parseDraw = (s: string): Draw | null => {
  const trail = s.endsWith(' ');
  const core = trail ? s.slice(0, -1) : s;
  if (core === '') return null;
  const groups: DrawGroup[] = [];
  for (const tok of core.split(' ')) {
    if (tok.length === 1 && CMDS.includes(tok)) {
      groups.push({ cmd: tok, nums: [] });
      continue;
    }
    const n = parseNum(tok);
    if (!n || groups.length === 0) return null;
    groups[groups.length - 1].nums.push(n);
  }
  return { groups, trail };
};

export const printDraw = (d: Draw): string => {
  const parts: string[] = [];
  for (const g of d.groups) {
    parts.push(g.cmd);
    for (const n of g.nums) parts.push(fmtNum(n));
  }
  return parts.join(' ') + (d.trail ? ' ' : '');
};

/** Splits `\a\b(\c)` at depth-0 backslashes; the pieces concatenate back to the input. */
const splitPieces = (s: string): string[] => {
  const out: string[] = [];
  let start = 0;
  let depth = 0;
  for (let i = 1; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 40) depth++;
    else if (c === 41) {
      if (depth > 0) depth--;
    } else if (c === 92 && depth === 0) {
      out.push(s.slice(start, i));
      start = i;
    }
  }
  out.push(s.slice(start));
  return out;
};

/** `(...)` spanning the whole string with balanced parentheses => inner text. */
const inner = (r: string): string | null => {
  if (r.charCodeAt(0) !== 40 || r.charCodeAt(r.length - 1) !== 41) return null;
  let depth = 0;
  for (let i = 0; i < r.length; i++) {
    const c = r.charCodeAt(i);
    if (c === 40) depth++;
    else if (c === 41 && --depth === 0 && i !== r.length - 1) return null;
  }
  return depth === 0 ? r.slice(1, -1) : null;
};

const nums = (s: string, max: number): Num[] | null => {
  const parts = s.split(',');
  if (parts.length > max) return null;
  const out: Num[] = [];
  for (const p of parts) {
    const n = parseNum(p);
    if (!n) return null;
    out.push(n);
  }
  return out;
};

const printNums = (a: Num[]): string => a.map(fmtNum).join(',');

const HEX_RE = /^&H([0-9A-F]{1,8})&$/;

const build = (def: TagDef, r: string, depth: number): Tag | null => {
  switch (def.kind) {
    case 'num': {
      if (r === '') return { k: 'n', id: def.id, nums: [] };
      const n = parseNum(r);
      return n ? { k: 'n', id: def.id, nums: [n] } : null;
    }
    case 'hex': {
      if (r === '') return { k: 'h', id: def.id, n: { m: 0, d: 0 }, digits: 0 };
      const m = HEX_RE.exec(r);
      return m ? { k: 'h', id: def.id, n: { m: parseInt(m[1], 16), d: 0 }, digits: m[1].length } : null;
    }
    case 'str':
      return { k: 's', id: def.id, s: r };
    case 'par': {
      const body = inner(r);
      const a = body === null ? null : nums(body, 8);
      return a && (def.count === 0 ? a.length === 4 || a.length === 6 : a.length === def.count) ? { k: 'n', id: def.id, nums: a } : null;
    }
    case 'clip': {
      const body = inner(r);
      if (body === null) return null;
      const rect = nums(body, 4);
      if (rect && rect.length === 4) return { k: 'n', id: def.id, nums: rect };
      const comma = body.indexOf(',');
      const scale = comma === -1 ? null : parseNum(body.slice(0, comma));
      const draw = parseDraw(comma !== -1 && scale ? body.slice(comma + 1) : body);
      return draw && (comma === -1 || scale) ? { k: 'c', id: def.id, scale, draw } : null;
    }
    case 't': {
      const body = inner(r);
      const at = body === null ? -1 : body.indexOf('\\');
      if (body === null || at === -1 || depth >= MAX_DEPTH) return null;
      let a: Num[] = [];
      if (at > 0) {
        if (body[at - 1] !== ',') return null;
        const p = nums(body.slice(0, at - 1), 3);
        if (!p) return null;
        a = p;
      }
      return { k: 't', nums: a, tags: splitPieces(body.slice(at)).map((p) => parsePiece(p, depth + 1)) };
    }
  }
};

export const printTag = (t: Tag): string => {
  switch (t.k) {
    case 'v':
      return t.raw;
    case 'n': {
      const name = TAG_BY_ID[t.id]!;
      return name.kind === 'num' ? `\\${name.name}${t.nums.length ? fmtNum(t.nums[0]) : ''}` : `\\${name.name}(${printNums(t.nums)})`;
    }
    case 'h':
      return `\\${TAG_BY_ID[t.id]!.name}${t.digits ? `&H${t.n.m.toString(16).toUpperCase().padStart(t.digits, '0')}&` : ''}`;
    case 's':
      return `\\${TAG_BY_ID[t.id]!.name}${t.s}`;
    case 'c':
      return `\\${TAG_BY_ID[t.id]!.name}(${t.scale ? `${fmtNum(t.scale)},` : ''}${printDraw(t.draw)})`;
    case 't':
      return `\\t(${printNums(t.nums)}${t.nums.length ? ',' : ''}${t.tags.map(printTag).join('')})`;
  }
};

const parsePiece = (piece: string, depth: number): Tag => {
  const def = matchTag(piece.slice(1));
  if (def) {
    const tag = build(def, piece.slice(1 + def.name.length), depth);
    if (tag && printTag(tag) === piece) return tag;
  }
  return { k: 'v', raw: piece };
};

const parseBlock = (content: string): Seg => {
  const at = content.indexOf('\\');
  if (at === -1) return { k: 'blk', pre: content, tags: [] };
  return { k: 'blk', pre: content.slice(0, at), tags: splitPieces(content.slice(at)).map((p) => parsePiece(p, 0)) };
};

export const printSeg = (g: Seg): string => {
  switch (g.k) {
    case 'lit':
      return g.s;
    case 'draw':
      return printDraw(g.d);
    case 'blk':
      return `{${g.pre}${g.tags.map(printTag).join('')}}`;
  }
};

export const printText = (segs: Seg[]): string => segs.map(printSeg).join('');

/** Text => segments. Always exact: a line the model cannot reproduce byte for byte becomes a single literal. */
export const parseTextModel = (text: string): Seg[] => {
  const segs: Seg[] = [];
  let level = 0;
  let i = 0;
  const lit = (s: string): void => {
    if (level > 0) {
      const d = parseDraw(s);
      if (d) {
        segs.push({ k: 'draw', d });
        return;
      }
    }
    segs.push({ k: 'lit', s });
  };
  while (i < text.length) {
    const open = text.indexOf('{', i);
    const close = open === -1 ? -1 : text.indexOf('}', open + 1);
    if (close === -1) {
      lit(text.slice(i));
      break;
    }
    if (open > i) lit(text.slice(i, open));
    const blk = parseBlock(text.slice(open + 1, close));
    segs.push(blk);
    if (blk.k === 'blk') {
      for (const t of blk.tags) {
        if (t.k === 'n' && t.id === TAG_P) level = t.nums.length ? Math.max(0, Math.trunc(t.nums[0].m / 10 ** t.nums[0].d)) : 0;
      }
    }
    i = close + 1;
  }
  return printText(segs) === text ? segs : [{ k: 'lit', s: text }];
};

export { TAG_T, VERB_ID };
