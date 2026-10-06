/** Level of detail rules: sprites are shared between events (and frames) when their parameters are close enough to be invisible. */

const STEP = Math.log(1.06);
/** Blurs below this many device pixels of sigma are imperceptible (the sprite is drawn sharp). */
export const MIN_SIGMA_DEVICE = 0.35;

/** Font size class: geometric steps of 6 % (the sprite is rescaled by at most 3 % when drawn). */
export const qSize = (px: number): number => (px > 0 ? Math.round(Math.exp(Math.round(Math.log(px) / STEP) * STEP) * 100) / 100 : 0);

/** Horizontal scale ratio to 2 %. */
export const qRatio = (r: number): number => Math.round(r * 50) / 50 || 1;

/** Blur sigma (layout units): exact when static, 20 % geometric classes when a `\t` animates it. */
export const qSigma = (s: number, animated: boolean): number => {
  if (s <= 0) return 0;
  if (!animated) return Math.round(s * 100) / 100;
  return Math.round(Math.exp(Math.round(Math.log(s / 0.25) / Math.log(1.2)) * Math.log(1.2)) * 0.25 * 100) / 100;
};

/** 0xBBGGRR to `[r, g, b]`; animated colours keep 5 bits per channel (error <= 4/255). */
export const rgb = (bgr: number, animated: boolean): [number, number, number] => {
  const ch = [bgr & 0xff, (bgr >> 8) & 0xff, (bgr >> 16) & 0xff];
  const q = (v: number): number => (animated ? Math.min(255, Math.round(v / 8) * 8) : v);
  return [q(ch[0]), q(ch[1]), q(ch[2])];
};

/** CSS colour; `alpha` is the ASS value (0 opaque .. 255 transparent) or null for an opaque colour (alpha is applied at draw time). */
export const colourCss = (bgr: number, animated: boolean, alpha: number | null): string => {
  const [r, g, b] = rgb(bgr, animated);
  if (alpha === null) return `rgb(${r},${g},${b})`;
  const a = Math.round((1 - Math.min(255, Math.max(0, alpha)) / 255) * 16) / 16;
  return `rgba(${r},${g},${b},${a})`;
};
