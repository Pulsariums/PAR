import type { AssStyle, SetOp, StateKey, StateOp, Transition } from '../types/script';

/** Fully resolved text state of one fragment (style + overrides). Colours 0xBBGGRR, alphas 0..255. */
export interface TextState {
  /** Style in effect (changes with `\r<style>`); `null` tag values revert to it. */
  style: AssStyle;
  fn: string;
  fs: number;
  b: number;
  i: boolean;
  u: boolean;
  s: boolean;
  fscx: number; fscy: number; fsp: number;
  frx: number; fry: number; frz: number; fax: number; fay: number;
  xbord: number; ybord: number; xshad: number; yshad: number;
  blur: number; be: number; pbo: number;
  c1: number; c2: number; c3: number; c4: number;
  a1: number; a2: number; a3: number; a4: number;
}

export const stateFromStyle = (style: AssStyle): TextState => ({
  style,
  fn: style.fontName,
  fs: style.fontSize,
  b: style.bold,
  i: style.italic,
  u: style.underline,
  s: style.strikeOut,
  fscx: style.scaleX, fscy: style.scaleY, fsp: style.spacing,
  frx: 0, fry: 0, frz: style.angle, fax: 0, fay: 0,
  xbord: style.outline, ybord: style.outline, xshad: style.shadow, yshad: style.shadow,
  blur: 0, be: 0, pbo: 0,
  c1: style.primaryColour, c2: style.secondaryColour, c3: style.outlineColour, c4: style.backColour,
  a1: style.primaryAlpha, a2: style.secondaryAlpha, a3: style.outlineAlpha, a4: style.backAlpha,
});

type NumKey = Exclude<StateKey, 'fn' | 'i' | 'u' | 's'>;
const COLOR_KEYS = new Set<StateKey>(['c1', 'c2', 'c3', 'c4']);
/** Keys `\t` can animate (libass); others inside `\t` are ignored. */
const ANIMATABLE = new Set<StateKey>([
  'fs', 'fscx', 'fscy', 'fsp', 'frx', 'fry', 'frz', 'fax', 'fay', 'xbord', 'ybord', 'xshad', 'yshad',
  'blur', 'be', 'c1', 'c2', 'c3', 'c4', 'a1', 'a2', 'a3', 'a4',
]);

/** Value an op sets, given the current state (handles `null` = style value and relative `\fs`). */
export const targetValue = (st: TextState, op: SetOp): number | string | boolean => {
  const base = stateFromStyle(st.style);
  if (op.key === 'fs') {
    if (op.value === null) return base.fs;
    const v = Number(op.value);
    const next = op.relative ? st.fs * (1 + v / 10) : v;
    return next > 0 ? next : base.fs;
  }
  if (op.value === null) return base[op.key];
  if (op.key === 'fn') return String(op.value);
  if (op.key === 'i' || op.key === 'u' || op.key === 's') return Number(op.value) !== 0;
  return Number(op.value);
};

const setKey = (st: TextState, key: StateKey, v: number | string | boolean): void => {
  (st as unknown as Record<string, unknown>)[key] = v;
};

export const applySet = (st: TextState, op: SetOp): void => setKey(st, op.key, targetValue(st, op));

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Per-channel colour interpolation (0xBBGGRR). */
export const lerpColor = (a: number, b: number, k: number): number => {
  let out = 0;
  for (let sh = 0; sh <= 16; sh += 8) {
    out |= (Math.round(lerp((a >> sh) & 0xff, (b >> sh) & 0xff, k)) & 0xff) << sh;
  }
  return out >>> 0;
};

/** Progress of a transition at `t` ms (libass: step when t2 <= t1, `pow(p, accel)` otherwise). */
export const transitionProgress = (tr: Transition, t: number, durationMs: number): number => {
  const t1 = tr.t1;
  const t2 = tr.t2 === null ? durationMs : tr.t2;
  if (t < t1) return 0;
  if (t >= t2) return 1;
  const p = (t - t1) / (t2 - t1);
  return tr.accel > 0 ? Math.pow(p, tr.accel) : 1;
};

export interface FoldEnv {
  /** ms since line start */
  t: number;
  durationMs: number;
  /** Resolves `\r` targets (`null` = line style). */
  resetStyle: (name: string | null) => AssStyle;
}

const applyTransition = (st: TextState, tr: Transition, k: number): void => {
  for (const op of tr.ops) {
    if (!ANIMATABLE.has(op.key)) continue;
    const to = targetValue(st, op) as number;
    const key = op.key as NumKey;
    const from = st[key];
    if (COLOR_KEYS.has(key)) setKey(st, key, lerpColor(from, to, k));
    else if (key[0] === 'a') setKey(st, key, Math.round(lerp(from, to, k)));
    else setKey(st, key, lerp(from, to, k));
  }
};

/** Applies ordered ops to `st` in place (sets, `\r` resets, `\t` evaluated at `env.t`). */
export const foldOps = (st: TextState, ops: StateOp[], env: FoldEnv): TextState => {
  let cur = st;
  for (const op of ops) {
    if (op.type === 'set') applySet(cur, op);
    else if (op.type === 'r') cur = stateFromStyle(env.resetStyle(op.style));
    else applyTransition(cur, op, transitionProgress(op, env.t, env.durationMs));
  }
  return cur;
};
