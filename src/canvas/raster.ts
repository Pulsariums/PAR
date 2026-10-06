import type { PlateSpec, SpriteSpec } from './types';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Surface = HTMLCanvasElement | OffscreenCanvas;

/** Largest sprite side in device pixels (bigger glyphs are left to the DOM path). */
export const MAX_SIDE = 2048;

export interface Sprite {
  canvas: Surface;
  /** Bitmap size in device pixels. */
  w: number;
  h: number;
  /** Box width in layout units at the sprite's size class (advance + spacing, times the horizontal scale). */
  boxW: number;
  /** Transparent margin around the box (layout units) that holds borders, blur and shadows. */
  pad: number;
  bytes: number;
}

export const makeSurface = (w: number, h: number): Surface => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

const ctxOf = (c: Surface): Ctx | null => c.getContext('2d') as Ctx | null;

let support: boolean | null = null;
/** Forget the capability probe (tests swap the canvas implementation). */
export const resetCanvasSupport = (): void => { support = null; scratches.clear(); };
/** True when this browser can run the canvas path: 2D contexts, `ctx.filter` blur and font box metrics. */
export const canvasSupported = (): boolean => {
  if (support !== null) return support;
  // jsdom has no canvas (and logs an error for every getContext call).
  if (typeof OffscreenCanvas === 'undefined' && typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return (support = false);
  try {
    const ctx = ctxOf(makeSurface(4, 4));
    support = !!ctx && 'filter' in ctx && typeof ctx.measureText('x').fontBoundingBoxAscent === 'number' && 'letterSpacing' in ctx;
  } catch { support = false; }
  return support;
};

const scratches = new Map<string, { c: Surface; ctx: Ctx }>();
/**
 * Work bitmap for one blurred / carved plate. Sizes are bucketed (multiples of 32): a bitmap that is much larger than the sprite
 * would be copied whenever it is snapshotted, which costs more than the blur itself.
 */
const scratchFor = (w: number, h: number): { c: Surface; ctx: Ctx } | null => {
  const bw = Math.ceil(w / 32) * 32;
  const bh = Math.ceil(h / 32) * 32;
  const key = `${bw}x${bh}`;
  let s = scratches.get(key);
  if (!s) {
    if (scratches.size >= 24) scratches.clear();
    const c = makeSurface(bw, bh);
    const ctx = ctxOf(c);
    if (!ctx) return null;
    scratches.set(key, (s = { c, ctx }));
  }
  return s;
};

const fontOf = (s: SpriteSpec): string => `${s.italic ? 'italic ' : ''}${s.weight} ${s.size * s.ratio}px ${s.family}`;

/** Draws one plate (text shadow, stroke, fill, carve) with its box top-left at (`ox`, `oy`) layout units. */
const paintPlate = (ctx: Ctx, s: SpriteSpec, p: PlateSpec, ox: number, oy: number, baseline: number): void => {
  ctx.setTransform(s.scale, 0, 0, s.scale, 0, 0);
  ctx.translate(ox + p.dx * s.rx, oy + p.dy);
  ctx.scale(s.rx, 1);
  ctx.font = fontOf(s);
  ctx.fontKerning = s.kerning ? 'auto' : 'none';
  ctx.letterSpacing = `${s.spacing}px`;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 4;
  const text = (fill: string | null, stroke: string | null, w: number, dx = 0, dy = 0): void => {
    if (stroke && w > 0) { ctx.lineWidth = w; ctx.strokeStyle = stroke; ctx.strokeText(s.text, dx, baseline + dy); }
    if (fill) { ctx.fillStyle = fill; ctx.fillText(s.text, dx, baseline + dy); }
  };
  if (p.shadow) text(p.shadow.colour, p.strokeW > 0 ? p.shadow.colour : null, p.strokeW, p.shadow.dx, p.shadow.dy);
  text(p.fill, p.stroke, p.strokeW);
  if (p.carve) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.fillText(s.text, 0, baseline);
    ctx.globalCompositeOperation = 'source-over';
  }
};

/** Rasterises a sprite: every plate in order, blurred plates through a scratch bitmap (`ctx.filter`). Null when it cannot be built. */
export const buildSprite = (s: SpriteSpec): Sprite | null => {
  const probe = scratchFor(8, 8);
  if (!probe) return null;
  const m = probe.ctx;
  m.setTransform(1, 0, 0, 1, 0, 0);
  m.font = fontOf(s);
  m.fontKerning = s.kerning ? 'auto' : 'none';
  m.letterSpacing = `${s.spacing}px`;
  const tm = m.measureText(s.text);
  const asc = Math.round(tm.fontBoundingBoxAscent);
  const desc = Math.round(tm.fontBoundingBoxDescent);
  // Browsers centre the glyph box in a line box of height `size` (half-leading) and round ascent / descent to whole pixels.
  const baseline = (s.size - (asc + desc)) / 2 + asc;
  const boxW = tm.width * s.rx;
  const reach = Math.max(0, ...s.plates.map((p) => Math.max(p.strokeW / 2 + Math.max(Math.abs(p.dx), Math.abs(p.dy)) + (p.shadow ? Math.max(Math.abs(p.shadow.dx), Math.abs(p.shadow.dy)) : 0), 0) * Math.max(1, s.rx) + 3 * p.blur));
  const pad = Math.ceil(reach + 2);
  const w = Math.ceil((boxW + 2 * pad) * s.scale);
  const h = Math.ceil((s.size + 2 * pad) * s.scale);
  if (w > MAX_SIDE || h > MAX_SIDE || w < 1 || h < 1) return null;
  const canvas = makeSurface(w, h);
  const ctx = ctxOf(canvas);
  if (!ctx) return null;
  for (const p of s.plates) {
    if (p.blur <= 0 && !p.carve) { paintPlate(ctx, s, p, pad, pad, baseline); continue; }
    const t = scratchFor(w, h);
    if (!t) return null;
    t.ctx.setTransform(1, 0, 0, 1, 0, 0);
    t.ctx.clearRect(0, 0, w, h);
    paintPlate(t.ctx, s, p, pad, pad, baseline);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = p.blur > 0 ? `blur(${p.blur * s.scale}px)` : 'none';
    ctx.drawImage(t.c as CanvasImageSource, 0, 0, w, h, 0, 0, w, h);
    ctx.filter = 'none';
  }
  return { canvas, w, h, boxW, pad, bytes: w * h * 4 };
};
