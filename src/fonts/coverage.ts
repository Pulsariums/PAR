import { u16, u32 } from './bytes';

/** Code points a font maps to a glyph, as sorted, merged inclusive ranges: [start0, end0, start1, end1, ...]. */
export type Coverage = Uint32Array;

const MAX_RANGES = 200000;

/** Appends [s, e] to `out`, merging with the previous range when they touch or overlap (input is sorted by start). */
const push = (out: number[], s: number, e: number): void => {
  const n = out.length;
  if (n && s <= out[n - 1] + 1) { if (e > out[n - 1]) out[n - 1] = e; } else if (n < MAX_RANGES * 2) out.push(s, e);
};

const format4 = (t: Uint8Array, o: number, out: number[]): void => {
  const segs = u16(t, o + 6) >> 1;
  const end = o + 14;
  const start = end + segs * 2 + 2;
  const delta = start + segs * 2;
  const range = delta + segs * 2;
  for (let i = 0; i < segs; i++) {
    const [s, e, ro] = [u16(t, start + i * 2), u16(t, end + i * 2), u16(t, range + i * 2)];
    if (s > e || (s === 0xffff && e === 0xffff)) continue;
    if (ro === 0) {
      // idDelta maps every char of the segment; glyph 0 (.notdef) only when (c + delta) mod 65536 === 0
      const d = u16(t, delta + i * 2);
      const hole = (0x10000 - d) & 0xffff;
      if (hole >= s && hole <= e) { if (hole > s) push(out, s, hole - 1); if (hole < e) push(out, hole + 1, e); } else push(out, s, e);
      continue;
    }
    for (let c = s; c <= e; c++) {
      const g = u16(t, range + i * 2 + ro + (c - s) * 2);
      if (g !== 0) push(out, c, c);
    }
  }
};

const format12 = (t: Uint8Array, o: number, out: number[]): void => {
  const n = Math.min(u32(t, o + 12), MAX_RANGES);
  for (let i = 0; i < n; i++) {
    const [s, e] = [u32(t, o + 16 + i * 12), u32(t, o + 20 + i * 12)];
    if (s <= e && e <= 0x10ffff) push(out, s, e);
  }
};

/** Union of the Unicode subtables (formats 4 and 12) of a `cmap` table. Never throws; unreadable => empty. */
export const readCmap = (t: Uint8Array): Coverage => {
  const parts: number[][] = [];
  const n = Math.min(u16(t, 2), 64);
  const seen = new Set<number>();
  for (let i = 0; i < n; i++) {
    const [plat, enc, off] = [u16(t, 4 + i * 8), u16(t, 6 + i * 8), u32(t, 8 + i * 8)];
    const unicode = plat === 0 || (plat === 3 && (enc === 1 || enc === 10));
    if (!unicode || seen.has(off) || off + 6 > t.length) continue;
    seen.add(off);
    const fmt = u16(t, off);
    const part: number[] = [];
    if (fmt === 4) format4(t, off, part);
    else if (fmt === 12) format12(t, off, part);
    else continue;
    parts.push(part);
  }
  const pairs: Array<[number, number]> = parts.flatMap((p) => Array.from({ length: p.length / 2 }, (_, k): [number, number] => [p[k * 2], p[k * 2 + 1]]));
  pairs.sort((a, b) => a[0] - b[0]);
  const out: number[] = [];
  for (const [s, e] of pairs) push(out, s, e);
  return Uint32Array.from(out);
};

/** Does the font map `cp`? Binary search over the ranges. */
export const hasCp = (c: Coverage, cp: number): boolean => {
  let lo = 0;
  let hi = c.length / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < c[mid * 2]) hi = mid - 1;
    else if (cp > c[mid * 2 + 1]) lo = mid + 1;
    else return true;
  }
  return false;
};

/** Number of mapped code points inside [from, to]. */
export const countIn = (c: Coverage, from: number, to: number): number => {
  let n = 0;
  for (let i = 0; i < c.length; i += 2) {
    const [s, e] = [Math.max(c[i], from), Math.min(c[i + 1], to)];
    if (e >= s) n += e - s + 1;
  }
  return n;
};

export const countAll = (c: Coverage): number => countIn(c, 0, 0x10ffff);

/** The n-th mapped code point (0-based), or -1: lets a UI page through a font without materialising every code point. */
export const nthCp = (c: Coverage, n: number): number => {
  for (let i = 0; i < c.length; i += 2) {
    const len = c[i + 1] - c[i] + 1;
    if (n < len) return c[i] + n;
    n -= len;
  }
  return -1;
};

/** `count` mapped code points starting at the `from`-th (0-based), ascending: one page of a glyph grid without materialising the font. */
export const sliceCps = (c: Coverage, from: number, count: number): number[] => {
  const out: number[] = [];
  let skip = from;
  for (let i = 0; i < c.length && out.length < count; i += 2) {
    const len = c[i + 1] - c[i] + 1;
    if (skip >= len) { skip -= len; continue; }
    for (let cp = c[i] + skip; cp <= c[i + 1] && out.length < count; cp++) out.push(cp);
    skip = 0;
  }
  return out;
};
