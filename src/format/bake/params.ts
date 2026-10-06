/** Parameters of the lossy PAR bake and the numeric tolerances derived from them. */
export interface BakeParams {
  /** Target render frame rate (1..90). */
  fps: number;
  /** Sample phase in frames: frame k is rendered at (k + phase) / fps. Default 0. */
  phase: number;
  /** Maximum geometric error in screen pixels at `renderHeight`. Default 0.125 (1/8 px). */
  tolPx: number;
  /** Height (px) the script is assumed to be shown at; default = PlayResY (1 script unit = 1 px). */
  renderHeight: number | null;
  /** Merge consecutive identical static positioned lines into one. Default true. */
  merge: boolean;
}

export const defaultParams = (fps: number, over: Partial<BakeParams> = {}): BakeParams => ({
  fps, phase: 0, tolPx: 0.125, renderHeight: null, merge: true, ...over,
});

const NICE = [1, 0.1, 0.01, 0.001, 0.0001];
/** Largest power-of-ten quantum not above `q`: values stay on a decimal grid, so the lossless coder sees small residuals (a 0.25 grid would not). */
export const nice = (q: number): number => NICE.find((n) => n <= q + 1e-12) ?? NICE[NICE.length - 1];

export interface Quanta {
  /** pos, org, move, clip rect, bord, shad (script px). */
  pos: number;
  angle: number;
  /** fscx/fscy in percent. */
  scale: number;
  shear: number;
  spacing: number;
  blur: number;
  /** Font size quantum as a function of the size itself. */
  fs: (size: number) => number;
  /** Drawing coordinate quantum for `\p<level>` and a maximum glyph scale (1 = 100 %). */
  draw: (level: number, maxScale: number) => number;
}

/**
 * Worst-case reasoning (each term bounds the on-screen displacement of any point by `tolPx`):
 * a position error moves everything by that error; an angle error moves a point at most `diag` away from the
 * origin by diag*angle; a percent scale error stretches at most a screen-wide text by W*err/100; a shear error
 * shifts by H*err. Rounding to a multiple of q errs by at most q/2, hence q = 2*tol/(gain).
 */
export const quanta = (p: BakeParams, w: number, h: number): Quanta => {
  const s = (p.renderHeight ?? h) / h;
  const t = (2 * p.tolPx) / s;
  const diag = Math.hypot(w, h);
  return {
    pos: nice(t),
    angle: nice(t / ((diag * Math.PI) / 180)),
    scale: nice(t / (w / 100)),
    shear: nice(t / h),
    spacing: nice(t / 100),
    blur: nice(t / 2),
    fs: (size) => nice((t * Math.max(size, 1)) / w),
    draw: (level, maxScale) => nice((t * 2 ** (level - 1)) / Math.max(maxScale, 1e-6)),
  };
};

/** Frame k is sampled at t_k = (k + phase) / fps. First frame index at or after time `t` (seconds). */
export const frameAtOrAfter = (t: number, p: BakeParams): number => Math.ceil(t * p.fps - p.phase - 1e-9);
export const frameTime = (k: number, p: BakeParams): number => (k + p.phase) / p.fps;
/** Largest centisecond value not after frame `k`'s sample time (the grid-aligned boundary used for starts and ends). */
export const gridCs = (k: number, p: BakeParams): number => Math.floor(frameTime(k, p) * 100 + 1e-6);
