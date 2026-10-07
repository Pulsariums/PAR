import type { SpriteSpec } from './types';

/**
 * Rough cost of building one sprite, from its spec alone (no canvas): used to order and budget the look-ahead and by the script
 * analyzer. Constants are per-device-pixel and per-plate figures measured on the software Chromium of the bench rig for 20-100 px
 * glyphs (tools/bench/cost.mjs); a faster or slower machine scales all of them, which is why the live budget measures its own builds.
 */
export const COST = { base: 0.12, plate: 0.05, blurBase: 0.08, perPx: 2.2e-6, blurPx: 0.15, tintBase: 0.04, tintPerPx: 8e-7 };

/** Estimated bitmap size in device pixels (ink box plus stroke, shadow and 3 sigma of blur, like `inkBounds` but from the font size alone). */
export const estimateSize = (s: SpriteSpec): { w: number; h: number } => {
  const chars = [...s.text].length;
  let pad = 0;
  for (const p of s.plates) pad = Math.max(pad, p.strokeW / 2 + 3 * p.blur + Math.max(Math.abs(p.dx), Math.abs(p.dy)) + (p.shadow ? Math.max(Math.abs(p.shadow.dx), Math.abs(p.shadow.dy)) : 0));
  const adv = (s.size * 0.6 + s.spacing) * chars * s.rx;
  return { w: Math.max(1, Math.ceil((adv + 2 * pad * s.rx) * s.scale)), h: Math.max(1, Math.ceil((s.size * 1.2 + 2 * pad) * s.scale)) };
};

export const estimateBytes = (s: SpriteSpec): number => { const { w, h } = estimateSize(s); return w * h * 4; };

/** Estimated main-thread ms to rasterise the sprite (text, borders, blur). */
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
