import { makeSurface } from './raster';

/**
 * Coordinate space of `ctx.filter` blur lengths in this browser.
 *
 * The canvas draw-time blur (see `CanvasLayer.item`) computes its radius in canvas backing-store (device) pixels. Whether Chromium
 * then multiplies that radius by the current transformation matrix (filter lengths in *user* space, so `setTransform(f)` would
 * double-count `f`) or applies it in device space (lengths unaffected by the CTM) is implementation-visible only through pixels, and
 * the two readings disagree in the wild. One cheap probe settles it at runtime: draw a 1x1 device dot through `blur(2px)` under
 * `setTransform(2,0,0,2)` and measure how far the alpha spreads in device pixels. ~2 means device space (keep the radius as is);
 * ~4 means user space (the CTM multiplies it, so the string must be divided by the CTM scale). A browser we cannot probe (no
 * canvas, no `getImageData`) keeps the current device-space behaviour.
 */
let userSpace: boolean | null = null;

/** Radius the Gaussian actually spreads, from the alpha profile of one device row (variance minus the 2-px dot's own 0.25). */
const rowSigma = (row: Uint8ClampedArray, n: number): number => {
  let sum = 0, cx = 0;
  for (let x = 0; x < n; x++) {
    const a = row[x * 4 + 3];
    sum += a;
    cx += a * x;
  }
  if (sum < 20) return -1; // nothing drawn (or no blur survived the read): not a measurement
  cx /= sum;
  let v = 0;
  for (let x = 0; x < n; x++) {
    const d = x - cx;
    v += row[x * 4 + 3] * d * d;
  }
  return Math.sqrt(Math.max(v / sum - 0.25, 0.01));
};

const probe = (): boolean => {
  try {
    const c = makeSurface(32, 32);
    const ctx = (c as HTMLCanvasElement).getContext('2d') as
      (CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null);
    if (!ctx || typeof ctx.getImageData !== 'function' || !('filter' in ctx)) return false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 32, 32);
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.filter = 'blur(2px)';
    ctx.fillStyle = '#fff';
    ctx.fillRect(8, 8, 1, 1); // one user px: device columns/rows 16..17
    const s = rowSigma(ctx.getImageData(0, 16, 32, 1).data, 32);
    if (s < 0) return false;
    // blur(2px) under CTM 2: device-space lengths give sigma ~2, user-space lengths ~4.
    return s > 2.8;
  } catch {
    return false;
  }
};

/** True when this browser's `ctx.filter` lengths are multiplied by the current transform (user space). Probed once, then cached. */
export const filterUserSpace = (): boolean => (userSpace === null ? (userSpace = probe()) : userSpace);

/**
 * The `ctx.filter` blur string length for a target device-space sigma under a CTM with uniform scale `ctmScale`: unchanged when the
 * filter runs in device space, divided by the CTM scale when the browser interprets filter lengths in user space (they would be
 * multiplied back by the transform).
 */
export const filterPx = (sigmaDevice: number, ctmScale: number, userSpace: boolean): number =>
  Math.round((userSpace ? sigmaDevice / ctmScale : sigmaDevice) * 1e4) / 1e4;

/** Test seam: pre-seed or forget the probe result (null = probe again on next use). */
export const setFilterUserSpace = (v: boolean | null): void => { userSpace = v; };
