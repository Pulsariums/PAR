import type { PlateSpec, SpriteSpec } from './types';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Surface = HTMLCanvasElement | OffscreenCanvas;

/** Largest sprite side in device pixels (bigger glyphs are left to the DOM path). */
export const MAX_SIDE = 2048;

export interface Sprite {
  /** The bitmap: a canvas built here, or an ImageBitmap a worker built and transferred. */
  canvas: Surface | ImageBitmap;
  /** Bitmap size in device pixels. */
  w: number;
  h: number;
  /** Box width in layout units at the sprite's size class (advance + spacing, times the horizontal scale). */
  boxW: number;
  /** Top-left corner of the bitmap relative to the text box's top-left (layout units at the sprite's size class): the bitmap covers the ink, borders, shadows and blur tails, not the whole line box. */
  ox: number;
  oy: number;
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


const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/**
 * Layout-unit rectangle (relative to the box's top-left) that holds everything the plates paint: the measured ink of the glyphs
 * (not the line box, which is mostly empty for most letters), stroke reach, offsets, shadows and the blur tails (3 sigma).
 * Browsers that report no ink metrics fall back to the whole line box.
 */
export const inkBounds = (s: SpriteSpec, tm: TextMetrics, baseline: number, boxW: number): { x0: number; y0: number; x1: number; y1: number } => {
  const inkL = -num(tm.actualBoundingBoxLeft, 0);
  const inkR = num(tm.actualBoundingBoxRight, boxW / s.rx);
  const up = num(tm.actualBoundingBoxAscent, baseline);
  const down = num(tm.actualBoundingBoxDescent, s.size - baseline);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of s.plates) {
    const dxs = p.shadow ? [p.dx, p.dx + p.shadow.dx] : [p.dx];
    const dys = p.shadow ? [p.dy, p.dy + p.shadow.dy] : [p.dy];
    const sw = p.strokeW / 2;
    x0 = Math.min(x0, s.rx * (inkL + Math.min(...dxs) - sw) - 3 * p.blur);
    x1 = Math.max(x1, s.rx * (inkR + Math.max(...dxs) + sw) + 3 * p.blur);
    y0 = Math.min(y0, baseline - up + Math.min(...dys) - sw - 3 * p.blur);
    y1 = Math.max(y1, baseline + down + Math.max(...dys) + sw + 3 * p.blur);
  }
  // Draw-time blur (`animBlur`): the plate is sharp, so the room for the widest tail the animation can reach is carried as plain padding.
  const pad = s.pad ?? 0;
  if (pad > 0) { x0 -= pad; y0 -= pad; x1 += pad; y1 += pad; }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: -pad, y0: -pad, x1: boxW + pad, y1: s.size + pad };
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
  const asc = tm.fontBoundingBoxAscent;
  const desc = tm.fontBoundingBoxDescent;
  // libass requests the face at the size where its (win-metrics) ascent+descent cell equals `\fs`, and the baseline sits at
  // `winAsc/(winAsc+winDesc)` of that box. `size` here is exactly that box (`ratio` maps `\fs` to the CSS size that yields it, see
  // `fonts/ratio.ts`), so the baseline is the measured ascent rescaled onto `size`. When the browser's own cell already sums to
  // `size` this equals the old half-leading formula to the pixel; when the face's tables disagree it keeps the baseline inside the
  // `\fs` box instead of drifting (which pushed tall glyphs out of absolute `\clip` masks).
  const cell = asc + desc;
  const baseline = cell > 0 ? (s.size * asc) / cell : (s.size - cell) / 2 + asc;
  const boxW = tm.width * s.rx;
  const b = inkBounds(s, tm, baseline, boxW);
  // Whole device pixels from the box origin: the glyph keeps the same sub-pixel phase whatever the bitmap's size.
  const left = Math.floor(b.x0 * s.scale) - 1;
  const top = Math.floor(b.y0 * s.scale) - 1;
  const w = Math.ceil(b.x1 * s.scale) + 1 - left;
  const h = Math.ceil(b.y1 * s.scale) + 1 - top;
  if (w > MAX_SIDE || h > MAX_SIDE || w < 1 || h < 1) return null;
  const ox = left / s.scale;
  const oy = top / s.scale;
  const canvas = makeSurface(w, h);
  const ctx = ctxOf(canvas);
  if (!ctx) return null;
  for (const p of s.plates) {
    if (p.blur <= 0 && !p.carve) { paintPlate(ctx, s, p, -ox, -oy, baseline); continue; }
    const t = scratchFor(w, h);
    if (!t) return null;
    t.ctx.setTransform(1, 0, 0, 1, 0, 0);
    t.ctx.clearRect(0, 0, w, h);
    paintPlate(t.ctx, s, p, -ox, -oy, baseline);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = p.blur > 0 ? `blur(${p.blur * s.scale}px)` : 'none';
    ctx.drawImage(t.c as CanvasImageSource, 0, 0, w, h, 0, 0, w, h);
    ctx.filter = 'none';
  }
  return { canvas, w, h, boxW, ox, oy, bytes: w * h * 4 };
};
