/** Exact decimal numbers: `m * 10^-d` with integer mantissa. Round-trips the original text byte for byte. */
export interface Num {
  m: number;
  d: number;
}

const NUM_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const MAX_DIGITS = 15;
const MAX_DEC = 9;

/** Canonical decimal text => Num; null when the text would not print back identically (`.5`, `+1`, `01`, `-0`, `1e3`). */
export const parseNum = (s: string): Num | null => {
  if (s.length > MAX_DIGITS + 2 || !NUM_RE.test(s)) return null;
  const dot = s.indexOf('.');
  const d = dot === -1 ? 0 : s.length - dot - 1;
  if (d > MAX_DEC) return null;
  const digits = dot === -1 ? s : s.slice(0, dot) + s.slice(dot + 1);
  if (digits.replace('-', '').length > MAX_DIGITS) return null;
  const m = Number(digits);
  if (m === 0 && s[0] === '-') return null;
  return { m, d };
};

export const fmtNum = (n: Num): string => {
  const neg = n.m < 0;
  let s = String(neg ? -n.m : n.m);
  if (n.d > 0) {
    s = s.padStart(n.d + 1, '0');
    s = `${s.slice(0, -n.d)}.${s.slice(-n.d)}`;
  }
  return neg ? `-${s}` : s;
};

/** Mantissa of `n` rescaled to `d` decimals (deterministic prediction, may round). */
export const rescale = (n: Num, d: number): number => {
  if (n.d === d) return n.m;
  if (d > n.d) return n.m * 10 ** (d - n.d);
  return Math.round(n.m / 10 ** (n.d - d));
};

export const numValue = (n: Num): number => n.m / 10 ** n.d;

/** Nearest multiple of `q`, printed with the fewest decimals (used by the lossy baker). */
export const roundTo = (n: Num, q: number): Num => {
  const v = Math.round(numValue(n) / q) * q;
  let d = 0;
  while (d < MAX_DEC && Math.abs(v * 10 ** d - Math.round(v * 10 ** d)) > 1e-9) d++;
  const m = Math.round(v * 10 ** d);
  return { m: m === 0 ? 0 : m, d };
};
