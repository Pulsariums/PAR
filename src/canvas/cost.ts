import type { SpriteSpec } from './types';

/**
 * Rough cost of building one sprite, from its spec alone (no canvas): used to order and budget the look-ahead and by the script
 * analyzer. Constants are per-device-pixel and per-plate figures measured on the bench rig's real machine (four sprite workers,
 * software canvas, 20-100 px glyphs): a planned-and-built sprite costs ~4 ms of wall time there end to end, while the original
 * software-Chromium fit (0.27 ms/sprite) understated it ~9x, which made `deficit()` and every time gate around the look-ahead lie
 * on machines that "looked fast". A faster or slower machine scales all of them, which is why the live budget measures its own
 * builds (`SliceBudget.scaled`) on top of these figures.
 */
export const COST = { base: 1.0, plate: 0.4, blurBase: 0.7, perPx: 2.0e-5, blurPx: 1.3, tintBase: 0.36, tintPerPx: 7.2e-6 };

/**
 * Estimated bitmap size in device pixels (ink box plus stroke, shadow, 3 sigma of blur and the draw-time blur padding, like
 * `inkBounds` but from the font size alone). The draw-time padding is isotropic in device pixels like the gaussian that lands in it
 * (`inkBounds` adds it to x unscaled by `rx`), so it joins the estimate after the plate-reach multiplication, not inside it.
 */
export const estimateSize = (s: SpriteSpec): { w: number; h: number } => {
  const chars = [...s.text].length;
  let reach = 0;
  for (const p of s.plates) reach = Math.max(reach, p.strokeW / 2 + 3 * p.blur + Math.max(Math.abs(p.dx), Math.abs(p.dy)) + (p.shadow ? Math.max(Math.abs(p.shadow.dx), Math.abs(p.shadow.dy)) : 0));
  const pad = s.pad ?? 0;
  const adv = (s.size * 0.6 + s.spacing) * chars * s.rx;
  return { w: Math.max(1, Math.ceil((adv + 2 * (reach * s.rx + pad)) * s.scale)), h: Math.max(1, Math.ceil((s.size * 1.2 + 2 * (reach + pad)) * s.scale)) };
};

export const estimateBytes = (s: SpriteSpec): number => { const { w, h } = estimateSize(s); return w * h * 4; };

/** Estimated main-thread ms to rasterise the sprite (text, borders, blur). A sharp plate (animated blur, applied at draw time) is cheap to build. */
export const estimateBuildMs = (s: SpriteSpec): number => {
  const { w, h } = estimateSize(s);
  const px = w * h;
  let ms = COST.base;
  for (const p of s.plates) {
    ms += COST.plate;
    if (p.blur > 0 || p.carve) ms += COST.blurBase + px * COST.perPx * (1 + (p.blur > 0 ? COST.blurPx * p.blur * s.scale : 0));
  }
  return ms;
};

/** Estimated ms to recolour a shared mask (one `source-in` pass). */
export const estimateTintMs = (s: SpriteSpec): number => { const { w, h } = estimateSize(s); return COST.tintBase + w * h * COST.tintPerPx; };
