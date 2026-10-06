import { exportName } from '../common/exportName';

export type SubKind = 'ass' | 'xpar' | 'par';
export const DEFAULT_FPS = 24;
/** Frame rates a detected value snaps to (NTSC rates included). */
const KNOWN_FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];

/** Spread of the frames the rate is measured over: container clocks are often rounded to ms, so single steps (41 / 42 ms) mislead but a second of frames averages out. */
const SPAN = 24;

/** Frame rate from the presentation times (seconds) of consecutive frames: median of 24-frame spans, snapped to a known rate within 1.5 %. Null when unclear. */
export const detectFps = (times: readonly number[]): number | null => {
  const spans = times.slice(SPAN).map((t, i) => (t - times[i]!) / SPAN).filter((d) => d > 0);
  if (spans.length < 3) return null;
  const sorted = [...spans].sort((a, b) => a - b);
  const fps = 1 / sorted[Math.floor(sorted.length / 2)]!;
  const near = KNOWN_FPS.reduce((best, k) => (Math.abs(k - fps) < Math.abs(best - fps) ? k : best));
  return Math.abs(near - fps) / near < 0.015 ? near : null;
};

/** The export fps: what the user picked, else the video's detected fps, else 24. */
export const defaultFps = (picked: number | null, detected: number | null): number => {
  for (const v of [picked, detected]) if (v !== null && Number.isFinite(v) && v > 0) return v;
  return DEFAULT_FPS;
};

export interface Availability { xpar: string | null; par: string | null }

/** Why an export is not possible for a subtitle kind (null = possible). A .par cannot rebuild ASS and an XPAR is already lossless: no faking. */
export const exportBlockers = (kind: SubKind | null): Availability => {
  if (kind === null) return { xpar: 'none', par: 'none' };
  if (kind === 'ass') return { xpar: null, par: null };
  if (kind === 'xpar') return { xpar: 'isXpar', par: 'needAss' };
  return { xpar: 'needAss', par: 'isPar' };
};

export { exportName };
