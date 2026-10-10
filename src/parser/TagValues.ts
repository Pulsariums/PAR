/** Pure tag value parsers. Invalid value => null ("revert to style"). */
const NUM_RE = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/i;

/** Like a `strtod` prefix: "40abc" => 40, "" / "abc" => null. */
export const parseNum = (s: string): number | null => {
  const m = NUM_RE.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

/** `\i \u \s`: only 0 and 1 are valid (libass); anything else reverts to the style value (null). */
export const parseFlag = (s: string): 0 | 1 | null => {
  const n = parseNum(s);
  return n === 0 || n === 1 ? n : null;
};

/** `\b`: valid values are 0, 1 and >= 100 (libass); anything else reverts to the style value (null). */
export const parseBold = (s: string): number | null => {
  const n = parseNum(s);
  return n !== null && (n === 0 || n === 1 || n >= 100) ? n : null;
};

/** `\fn` argument: empty or `0` means the style font (null). */
export const parseFontName = (s: string): string | null => {
  const t = s.trim();
  return t === '' || t === '0' ? null : t;
};

/** Splits on top-level commas (nested parentheses are kept intact). */
export const splitArgs = (s: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
};

/** All-numeric argument list; null when any argument is not a number. */
export const parseNumList = (s: string): number[] | null => {
  const nums = splitArgs(s).map((a) => (a === '' ? null : parseNum(a)));
  return nums.every((n) => n !== null) ? (nums as number[]) : null;
};

/** Hex value after an optional `&H` / `H` prefix; null when there are no hex digits. */
export const parseHex = (s: string): number | null => {
  const m = /^\s*&?H?([0-9a-f]+)/i.exec(s);
  if (!m) return null;
  const v = parseInt(m[1].slice(-8), 16);
  return Number.isFinite(v) ? v >>> 0 : null;
};

/** Colour tag `&HBBGGRR&` => 0xBBGGRR (alpha byte, if any, is dropped). */
export const parseColorTag = (s: string): number | null => {
  const v = parseHex(s);
  return v === null ? null : v & 0xffffff;
};

/** Alpha tag `&HAA&` => 0..255. */
export const parseAlphaTag = (s: string): number | null => {
  const v = parseHex(s);
  return v === null ? null : v & 0xff;
};

/**
 * `\alpha&HAABBGGRR&`: the four bytes are the alphas of primary, secondary, border and shadow (`\alpha` sets all four colours at
 * once, and libass reads the low byte for the primary, then GG/BB/AA up). A bare `&HAA&` (short) sets every alpha to `AA`.
 * Returns null when there are no hex digits (the caller leaves the alphas at their style values, like a bare `\alpha`).
 */
export const parseAlphaBytes = (s: string): { a1: number; a2: number; a3: number; a4: number } | null => {
  const m = /^\s*&?H?([0-9a-f]+)/i.exec(s);
  if (!m) return null;
  const digits = m[1].slice(-8);
  const v = parseInt(digits, 16);
  if (!Number.isFinite(v)) return null;
  if (digits.length <= 2) {
    const a = v & 0xff;
    return { a1: a, a2: a, a3: a, a4: a };
  }
  return { a1: v & 0xff, a2: (v >> 8) & 0xff, a3: (v >> 16) & 0xff, a4: (v >>> 24) & 0xff };
};

/** Style colour field: `&HAABBGGRR` (hex) or a decimal integer (SSA). */
export const parseStyleColour = (s: string): { colour: number; alpha: number } | null => {
  const t = s.trim();
  let v: number | null;
  if (/^&?H/i.test(t)) v = parseHex(t);
  else {
    const n = parseInt(t, 10);
    v = Number.isFinite(n) ? n >>> 0 : null;
  }
  return v === null ? null : { colour: v & 0xffffff, alpha: (v >>> 24) & 0xff };
};

/** Legacy SSA alignment (`\a`: 1-3 bottom, 5-7 top, 9-11 middle) => numpad. Invalid => null. */
export const legacyToNumpad = (a: number): number | null => {
  if (!Number.isInteger(a) || a < 1 || a > 11) return null;
  const h = a & 3;
  if (h === 0) return null;
  return h + (a & 4 ? 6 : a & 8 ? 3 : 0);
};
