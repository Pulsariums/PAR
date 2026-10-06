import type { ClipShape } from '../render/clipCss';

import { makeSurface, type Sprite } from './raster';
import type { DrawItem } from './types';

/** A sprite already cut by its clip: draw it as is, at (`x`, `y`) layout units, no transform and no clip. */
export interface Baked extends Sprite {
  x: number;
  y: number;
}

const ids = new WeakMap<ClipShape, number>();
let next = 0;
const idOf = (c: ClipShape): number => {
  let i = ids.get(c);
  if (i === undefined) ids.set(c, (i = ++next));
  return i;
};

/** Where the unrotated sprite lands, layout units. */
const place = (it: DrawItem, sp: Sprite) => {
  const s = it.size / it.spec.size;
  return {
    s,
    x: it.anchor[0] - it.ax * sp.boxW * s - sp.pad * s,
    y: it.anchor[1] - it.ay * it.size - sp.pad * s,
    w: (sp.w / it.spec.scale) * s,
    h: (sp.h / it.spec.scale) * s,
  };
};

/**
 * Complex vector clips (hundreds of vertices) are slow to apply on every draw. When the event neither rotates nor has a clip that
 * animates, glyph and clip are fixed on screen, so the cut result is the same every frame (only opacity changes): it is built once,
 * into a bitmap as small as the clip's box, and drawn as a plain sprite.
 */
export const bakeable = (it: DrawItem): ClipShape | null => {
  const c = it.clip.length === 1 ? it.clip[0] : null;
  return c && !c.rect && !c.evenodd && c.bbox && it.rot === 0 ? c : null;
};

/** Cache key of the baked sprite: sprite, placement and clip. */
export const bakeKey = (it: DrawItem, c: ClipShape): string => {
  const s = it.size / it.spec.size;
  return `${it.key}@${Math.round(it.anchor[0] * 100)},${Math.round(it.anchor[1] * 100)},${Math.round(s * 1000)},${it.ax},${it.ay}#${idOf(c)}`;
};

/** Builds the clipped bitmap. Null when nothing of the sprite is inside the clip (nothing to draw). */
export const bake = (it: DrawItem, sp: Sprite, c: ClipShape): Baked | null => {
  const f = it.spec.scale;
  const p = place(it, sp);
  const [bx1, by1, bx2, by2] = c.bbox!;
  const x0 = Math.floor(Math.max(p.x, bx1) * f) / f;
  const y0 = Math.floor(Math.max(p.y, by1) * f) / f;
  const x1 = Math.min(p.x + p.w, bx2);
  const y1 = Math.min(p.y + p.h, by2);
  const w = Math.ceil((x1 - x0) * f);
  const h = Math.ceil((y1 - y0) * f);
  if (w < 1 || h < 1) return null;
  const canvas = makeSurface(w, h);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.setTransform(f, 0, 0, f, -x0 * f, -y0 * f);
  ctx.clip(new Path2D(c.d));
  ctx.drawImage(sp.canvas as CanvasImageSource, 0, 0, sp.w, sp.h, p.x, p.y, p.w, p.h);
  return { canvas, w, h, boxW: 0, pad: 0, bytes: w * h * 4, x: x0, y: y0 };
};
