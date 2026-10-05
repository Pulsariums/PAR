import type { KaraokeSpan } from '../types/script';

export interface KaraokePhase {
  /** 0..1 portion drawn in the primary colour (`\k`/`\ko` jump 0 -> 1 at syllable start). */
  fill: number;
  /** `\ko`: false hides the outline (before the syllable starts). */
  outline: boolean;
}

/** Karaoke phase of a syllable at `t` ms since line start (libass semantics). */
export const karaokePhase = (k: KaraokeSpan, t: number): KaraokePhase => {
  if (k.type === 'kf') {
    const fill = k.duration <= 0 ? (t >= k.start ? 1 : 0) : Math.min(1, Math.max(0, (t - k.start) / k.duration));
    return { fill, outline: true };
  }
  const on = t >= k.start;
  return { fill: on ? 1 : 0, outline: k.type === 'ko' ? on : true };
};
