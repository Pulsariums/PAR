import { specKey } from './paint';
import { makeSurface, type Sprite } from './raster';
import type { SpriteSpec } from './types';

/** Opaque colour a plain single-colour sprite is tinted with; the shape (glyph, size, blur) is shared through a white mask. */
export interface Mask {
  spec: SpriteSpec;
  key: string;
  colour: string;
}

const WHITE = 'rgb(255,255,255)';

/**
 * Colour is the main source of distinct sprites (animated `\c`, random palettes) while the expensive part (text + blur) does not depend
 * on it. A one-plate sprite with only a fill is built as a white mask once and tinted per colour with one cheap pass.
 */
export const maskOf = (s: SpriteSpec): Mask | null => {
  const p = s.plates.length === 1 ? s.plates[0] : null;
  if (!p || !p.fill || p.stroke || p.shadow || p.carve || !p.fill.startsWith('rgb(') || p.fill === WHITE) return null;
  const spec: SpriteSpec = { ...s, plates: [{ ...p, fill: WHITE }] };
  return { spec, key: specKey(spec), colour: p.fill };
};

/** The mask recoloured: source-in keeps its alpha (blur included) and replaces the colour. */
export const tint = (m: Sprite, colour: string): Sprite | null => {
  const canvas = makeSurface(m.w, m.h);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.drawImage(m.canvas as CanvasImageSource, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, m.w, m.h);
  return { ...m, canvas };
};
