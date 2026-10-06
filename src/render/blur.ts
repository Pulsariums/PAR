/**
 * `\blur` / `\be` math, derived from libass (`ass_render.c`: `render_and_combine_glyphs`,
 * `quantize_blur`, `restore_blur`; `ass_bitmap.c`: `ass_synth_blur`; `c/c_be_blur.c`).
 */

/** libass clamps `\blur` to this (`BLUR_MAX_RADIUS`, ass_parse.h). */
export const BLUR_MAX = 100;
/** libass clamps `\be` to this (`MAX_BE`, ass_parse.c). */
export const BE_MAX = 127;
/** `\blur` N is a gaussian with sigma = N * 2 / sqrt(ln 256) pixels (libass `blur_radius_scale`). */
export const BLUR_SIGMA = 2 / Math.sqrt(Math.log(256));

/** Gaussian sigma of `\blur`, in layout units (the stage scale turns it into screen pixels like libass). */
export const blurSigma = (blur: number, scale = 1): number => (blur > 0 ? Math.min(blur, BLUR_MAX) * BLUR_SIGMA * scale : 0);

/** `\be` pass count: libass rounds with `+0.5` (VSFilter compatible) and clamps to 0..127. */
export const beCount = (be: number): number => Math.min(BE_MAX, Math.max(0, Math.trunc(be + 0.5)));

/**
 * One `\be` pass is a `[1 2 1] x [1 2 1] / 16` kernel in DEVICE pixels (variance 1/2 per axis), so N
 * passes are close to a gaussian with sigma = sqrt(N / 2) device pixels. Not scaled with the render size.
 */
export const beSigmaDevicePx = (be: number): number => Math.sqrt(beCount(be) / 2);

const px = (n: number): string => `${Math.round(n * 1000) / 1000}px`;

/** CSS `blur()` for `\blur` (layout units, times `scale` = libass blur_scale relative to PlayRes; the stage transform turns it into screen pixels). */
export const blurFn = (blur: number, scale = 1): string[] => {
  const s = blurSigma(blur, scale);
  return s > 0.001 ? [`blur(${px(s)})`] : [];
};

/**
 * CSS `blur()` for `\be`, which is in DEVICE pixels, so it is expressed through `--par-u` (layout
 * units per device pixel, set on the stage by the overlay).
 */
export const beFn = (be: number): string[] => {
  const d = beSigmaDevicePx(be);
  return d > 0 ? [`blur(calc(var(--par-u, 1) * ${Math.round(d * 1e4) / 1e4}px))`] : [];
};

/**
 * CSS filter chain for `\blur` then `\be`. Two successive gaussians add their variances, which is
 * what libass does (gaussian first, then the `\be` box passes).
 */
export const blurFilter = (blur: number, be: number, scale = 1): string => [...blurFn(blur, scale), ...beFn(be)].join(' ') || 'none';

/** Combined gaussian sigma in layout units, `unit` = layout units per device pixel (tests, SVG filters). */
export const totalSigma = (blur: number, be: number, unit: number): number => {
  const a = blurSigma(blur);
  const b = beSigmaDevicePx(be) * unit;
  return Math.sqrt(a * a + b * b);
};
