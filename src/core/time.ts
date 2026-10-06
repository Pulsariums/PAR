/**
 * Time rule of PAR (one place, integer milliseconds).
 *
 * ASS times are centiseconds, libass is called with an integer millisecond timestamp (mpv: `pts * 1000 + 0.5`, floored).
 * So PAR compares ONLY integers: an event is visible when `startMs <= tMs < endMs` (half-open: at its end instant the line is
 * gone and the next one, starting at the same instant, is there). Events with `endMs <= startMs` are never visible.
 *
 * - `msOf(seconds)`   event time => integer ms (`Math.round`, exact for centiseconds, immune to 0.1 + 0.2 style drift).
 * - `timeToMs(t, f)`  media time => integer ms. Without a frame rate: `Math.round(t * 1000)` (like mpv). With a frame rate the
 *   time first snaps to the START of its frame (n = floor(t * fps + 1e-6)) and the frame time is the exact fraction n / fps
 *   (NTSC rates 24000/1001, 30000/1001, ... are recognised), converted with one rounding: `Math.round(n * 1000 * den / num)`.
 */
export interface Rate {
  num: number;
  den: number;
}

const NTSC = [24000, 30000, 48000, 60000, 120000];

/** Exact fraction of a frame rate. 23.976 / 29.97 / 59.94 (within 0.0005 of n/1001) become n/1001, integers stay integers. */
export const frameRate = (fps: number): Rate => {
  for (const n of NTSC) if (Math.abs(fps - n / 1001) < 0.0005) return { num: n, den: 1001 };
  if (Number.isInteger(fps)) return { num: fps, den: 1 };
  return { num: Math.round(fps * 1000), den: 1000 };
};

/** Integer milliseconds of an event time given in seconds. */
export const msOf = (seconds: number): number => Math.round(seconds * 1000) + 0;

/** Index of the frame whose interval contains `t` (the 1e-6 absorbs float error such as 0.1 * 30). */
export const frameIndex = (t: number, r: Rate): number => Math.floor((t * r.num) / r.den + 1e-6);

/** Start of frame `n` in integer ms. */
export const frameMs = (n: number, r: Rate): number => Math.round((n * 1000 * r.den) / r.num) + 0;

/** Media time (seconds) => the integer ms the subtitle is evaluated at. `fps` null/0 = no frame grid. */
export const timeToMs = (t: number, fps: number | null): number => {
  if (!fps || !(fps > 0)) return msOf(t);
  return frameMs(frameIndex(t, frameRate(fps)), frameRate(fps));
};
