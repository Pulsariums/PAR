import type { ClipSpec, LineTags, Transition } from '../types/script';

import { transitionProgress } from './State';

/** `\pos` or `\move` position at `t` ms (null when the line is not positioned). libass semantics. */
export const positionAt = (tags: LineTags, t: number, durationMs: number): [number, number] | null => {
  if (tags.pos) return tags.pos;
  const m = tags.move;
  if (!m) return null;
  let t1 = m.length === 6 ? m[4] : 0;
  let t2 = m.length === 6 ? m[5] : 0;
  if (t1 <= 0 && t2 <= 0) {
    t1 = 0;
    t2 = durationMs;
  }
  const k = t <= t1 ? 0 : t >= t2 ? 1 : (t - t1) / (t2 - t1);
  return [m[0] + (m[2] - m[0]) * k, m[1] + (m[3] - m[1]) * k];
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

/** Rect clip at `t` ms with `\t(\clip(...))` transitions applied in order. */
export const clipAt = (clip: ClipSpec | undefined, transitions: Transition[], t: number, durationMs: number): ClipSpec | undefined => {
  if (!clip?.rect || transitions.length === 0) return clip;
  const r = [...clip.rect] as [number, number, number, number];
  for (const tr of transitions) {
    if (!tr.clip) continue;
    const k = transitionProgress(tr, t, durationMs);
    for (let i = 0; i < 4; i++) r[i] += (tr.clip[i] - r[i]) * k;
  }
  return { ...clip, rect: r };
};
