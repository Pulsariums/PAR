import type { ClipSpec, LineTags, Transition } from '../types/script';

import { transitionProgress } from './State';

/**
 * Caches the 6 Float32 values [x1, y1, x2, y2, t1, t2] for numeric interpolation.
 * libass semantics: swaps reversed times, and defaults t1=0, t2=durationMs when both <= 0.
 */
export const createMoveParams = (m: readonly number[], durationMs: number): Float32Array => {
  const buf = new Float32Array(6);
  buf[0] = m[0] ?? 0;
  buf[1] = m[1] ?? 0;
  buf[2] = m[2] ?? 0;
  buf[3] = m[3] ?? 0;
  let t1 = m.length >= 6 ? (m[4] ?? 0) : 0;
  let t2 = m.length >= 6 ? (m[5] ?? 0) : 0;
  if (t1 > t2) {
    const tmp = t1;
    t1 = t2;
    t2 = tmp;
  }
  if (t1 <= 0 && t2 <= 0) {
    t1 = 0;
    t2 = durationMs;
  }
  buf[4] = t1;
  buf[5] = t2;
  return buf;
};

/** Caches static position coordinates as 6 Float32 values [x, y, x, y, 0, durationMs]. */
export const createPosParams = (pos: readonly [number, number], durationMs: number): Float32Array => {
  const buf = new Float32Array(6);
  buf[0] = pos[0];
  buf[1] = pos[1];
  buf[2] = pos[0];
  buf[3] = pos[1];
  buf[4] = 0;
  buf[5] = durationMs;
  return buf;
};

/** True when a \move tag never actually moves (x1 == x2 && y1 == y2). */
export const isStaticMove = (mp: Float32Array): boolean =>
  mp[0] === mp[2] && mp[1] === mp[3];

/**
 * Direct evaluation of cached 6-element Float32Array [x1, y1, x2, y2, t1, t2] at time t.
 * Performs a single direct calculation without object allocations or re-parsing.
 * If `out` is provided, writes into `out` and returns it; otherwise allocates [x, y].
 */
export const positionFromParams = (
  mp: Float32Array,
  t: number,
  out?: [number, number],
): [number, number] => {
  let x: number;
  let y: number;
  if (mp[0] === mp[2] && mp[1] === mp[3]) {
    x = mp[0];
    y = mp[1];
  } else {
    const t1 = mp[4];
    const t2 = mp[5];
    if (t <= t1) {
      x = mp[0];
      y = mp[1];
    } else if (t >= t2) {
      x = mp[2];
      y = mp[3];
    } else {
      const k = (t - t1) / (t2 - t1);
      x = mp[0] + (mp[2] - mp[0]) * k;
      y = mp[1] + (mp[3] - mp[1]) * k;
    }
  }
  if (out) {
    out[0] = x;
    out[1] = y;
    return out;
  }
  return [x, y];
};

/** `\pos` or `\move` position at `t` ms (null when the line is not positioned). libass semantics. */
export const positionAt = (
  tags: LineTags,
  t: number,
  durationMs: number,
  out?: [number, number],
): [number, number] | null => {
  if (tags.pos) {
    if (out) {
      out[0] = tags.pos[0];
      out[1] = tags.pos[1];
      return out;
    }
    return tags.pos;
  }
  let mp = tags.moveParams;
  if (!mp) {
    const m = tags.move;
    if (!m) return null;
    mp = tags.moveParams = createMoveParams(m, durationMs);
  }
  return positionFromParams(mp, t, out);
};

/** libass `interpolate_alpha`: piecewise-linear alpha a1 -> a2 -> a3 over t1..t4. */
export const interpolateAlpha = (
  now: number, t1: number, t2: number, t3: number, t4: number, a1: number, a2: number, a3: number,
): number => {
  if (now < t1) return a1;
  if (now < t2) return t2 === t1 ? a2 : a1 + ((a2 - a1) * (now - t1)) / (t2 - t1);
  if (now < t3) return a2;
  if (now < t4) return t4 === t3 ? a3 : a2 + ((a3 - a2) * (now - t3)) / (t4 - t3);
  return a3;
};

/** Fade alpha 0 (visible)..255 (invisible) from `\fad` / `\fade` at `t` ms. */
export const fadeAlphaAt = (tags: LineTags, t: number, durationMs: number): number => {
  if (tags.fad) {
    const [fin, fout] = tags.fad;
    return interpolateAlpha(t, 0, fin, durationMs - fout, durationMs, 255, 0, 255);
  }
  if (tags.fade) {
    const [a1, a2, a3, t1, t2, t3, t4] = tags.fade;
    return interpolateAlpha(t, t1, t2, t3, t4, a1, a2, a3);
  }
  return 0;
};

/**
 * Rect clip at `t` ms with `\t(\clip(...))` transitions applied in order. libass starts from the
 * whole script area when the line has no rect clip, and stores each step as an integer (truncation).
 */
export const clipAt = (
  clip: ClipSpec | undefined, transitions: Transition[], t: number, durationMs: number,
  full?: [number, number, number, number],
): ClipSpec | undefined => {
  if (transitions.length === 0) return clip;
  const start = clip?.rect ?? full;
  if (!start) return clip;
  const r = [...start] as [number, number, number, number];
  for (const tr of transitions) {
    if (!tr.clip) continue;
    const k = transitionProgress(tr, t, durationMs);
    for (let i = 0; i < 4; i++) r[i] = Math.trunc(r[i] + (tr.clip[i] - r[i]) * k);
  }
  return { inverse: clip?.inverse ?? false, rect: r };
};
