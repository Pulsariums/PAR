import { ass, dialogue, style } from './ass';

/** Deterministic pseudo-random generator (mulberry32). */
export const rng = (seed: number): (() => number) => {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const STYLES = [style('Default', 'Alpha'), style('Sign', '@Beta', -1), style('Ital', 'Gamma', 0, -1), style('*Star', 'Delta', 1, 1), style('Plain', 'epsilon')];
const FONTS = ['Alpha', 'alpha ', '@Beta', 'Zeta', 'ETA', 'Theta Two', 'Iota'];
const WORDS = ['hello', 'Привет', 'ひらがな', '漢字', 'ğüşıöç', 'x', '12', '♪'];

/** One random event text exercising \fn, \b, \i, \r, \p, \t, \N, \h, comments and odd braces. */
export const randomText = (r: () => number): string => {
  const pick = <T>(a: T[]): T => a[Math.floor(r() * a.length)];
  let out = '';
  for (let n = 1 + Math.floor(r() * 4); n > 0; n--) {
    const k = r();
    if (k < 0.2) out += `{\\fn${pick(FONTS)}}`;
    else if (k < 0.3) out += `{\\b${pick(['0', '1', '700', '', 'x'])}}`;
    else if (k < 0.4) out += `{\\i${pick(['0', '1', ''])}}`;
    else if (k < 0.5) out += `{\\r${pick(['Sign', 'Ital', 'Star', 'Nope', ''])}}`;
    else if (k < 0.57) out += `{\\p${pick(['1', '0', '2'])}}`;
    else if (k < 0.64) out += `{\\t(0,500,\\fn${pick(FONTS)}\\fs40)}`;
    else if (k < 0.7) out += '{\\pos(10,20)\\an8\\blur2\\bord1\\clip(0,0,5,5)}';
    else if (k < 0.74) out += '{a comment}';
    out += pick(['\\N', '\\h', ' ', '']) + pick(WORDS);
  }
  return r() < 0.03 ? `${out}{\\fnOpen` : out;
};

export const eventLine = (r: () => number): string => dialogue(['Default', 'Sign', 'Ital', '*Star', 'Plain', 'Missing Style'][Math.floor(r() * 6)], randomText(r));

export const generateScript = (events: number, seed = 1): string => {
  const r = rng(seed);
  return ass(STYLES, Array.from({ length: events }, () => eventLine(r)));
};

/** Same script as a lazy line iterator: nothing but the current line is ever alive. */
export function* generateLines(events: number, seed = 1): Generator<string> {
  const head = ass(STYLES, []).split('\n');
  yield* head;
  const r = rng(seed);
  for (let i = 0; i < events; i++) yield eventLine(r);
}
