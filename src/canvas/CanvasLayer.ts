import type { Size } from '../layout/Layout';
import type { ClipShape } from '../render/clipCss';
import type { Overlay } from '../render/Overlay';

import type { Baked } from './bake';
import { pickShed, type Candidate } from './shed';
import type { Sprite } from './raster';
import type { DrawItem } from './types';

/** Items of consecutive canvas events (in layer / file order): they share one canvas, DOM lines keep their place between runs. */
export interface Run {
  layer: number;
  index: number;
  items: DrawItem[];
}

const DEG = Math.PI / 180;
const isBaked = (sp: Sprite | Baked): sp is Baked => 'x' in sp;
const MAX_PATHS = 1024;

interface Slot {
  el: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  attached: boolean;
  dirty: boolean;
}

/**
 * Canvas elements of the canvas path: one per run, pooled, each as large as the stage (layout size) with a device-resolution backing
 * store. Drawing a frame is one `drawImage` per item with its transform, opacity and clip; no DOM per event.
 */
export class CanvasLayer {
  private readonly slots: Slot[] = [];
  private readonly paths = new Map<string, Path2D>();
  private size = { w: 0, h: 0, f: 0 };
  private layout: Size = { width: 0, height: 0 };
  /** Items drawn and device pixels covered by the last `draw`. */
  drawn = 0;
  fillPx = 0;

  constructor(private readonly overlay: Overlay, readonly maxRuns = 6) {}

  get runsAvailable(): number { return this.maxRuns; }

  /** Backing store size follows the stage: `f` = device pixels per layout unit. */
  resize(layout: Size, f: number): void {
    const w = Math.max(1, Math.round(layout.width * f));
    const h = Math.max(1, Math.round(layout.height * f));
    this.layout = layout;
    if (w === this.size.w && h === this.size.h && f === this.size.f) return;
    this.size = { w, h, f };
    for (const s of this.slots) this.fit(s);
  }

  private fit(s: Slot): void {
    s.el.width = this.size.w;
    s.el.height = this.size.h;
    s.el.style.width = `${this.layout.width}px`;
    s.el.style.height = `${this.layout.height}px`;
    s.dirty = false;
  }

  private slot(i: number): Slot | null {
    if (i >= this.maxRuns) return null;
    while (this.slots.length <= i) {
      const el = document.createElement('canvas');
      el.className = 'par-canvas';
      el.style.position = 'absolute';
      el.style.left = '0px';
      el.style.top = '0px';
      const ctx = el.getContext('2d');
      if (!ctx) return null;
      const s = { el, ctx, attached: false, dirty: false };
      this.fit(s);
      this.slots.push(s);
    }
    return this.slots[i];
  }

  private path(d: string): Path2D {
    let p = this.paths.get(d);
    if (!p) {
      if (this.paths.size >= MAX_PATHS) this.paths.clear();
      this.paths.set(d, (p = new Path2D(d)));
    }
    return p;
  }

  /** Items of the last frame that were left out to meet the pixel budget (see `shed.ts`), and the ids of the ones left out last frame. */
  shed = 0;
  /** Last frame: time to get every sprite (cache lookups and builds) and time to draw them (shedding only acts on the second). */
  resolveMs = 0;
  compositeMs = 0;
  private shedIds = new Set<string>();

  /**
   * Draws the runs (canvas i = run i) and frees the canvases no run needs. `sprite` resolves an item's bitmap (null = skip it).
   * `budget` caps the pixels filled in one frame: past it the least visible items are left out (Infinity = draw everything).
   */
  draw(runs: Run[], sprite: (it: DrawItem) => Sprite | Baked | null, budget = Infinity): void {
    this.drawn = 0;
    this.fillPx = 0;
    this.shed = 0;
    const t0 = performance.now();
    const resolved = runs.map((run) => run.items.map((it) => (it.alpha < 0.004 ? null : sprite(it))));
    const t1 = performance.now();
    this.resolveMs = t1 - t0;
    const left = this.leave(runs, resolved, budget);
    runs.forEach((run, i) => {
      const s = this.slot(i);
      if (!s) return;
      s.ctx.setTransform(1, 0, 0, 1, 0, 0);
      s.ctx.clearRect(0, 0, s.el.width, s.el.height);
      s.dirty = true;
      const key = `${run.layer}:${run.index}`;
      if (!s.attached || s.el.dataset.parRun !== key) {
        s.el.remove();
        s.el.dataset.parRun = key;
        this.overlay.insert(s.el, run.layer, run.index);
        s.attached = true;
      }
      run.items.forEach((it, k) => {
        const sp = resolved[i][k];
        if (!sp || left.has(it)) return;
        this.drawn++;
        this.fillPx += sp.w * sp.h;
        if (isBaked(sp)) this.baked(s.ctx, it, sp);
        else this.item(s.ctx, it, sp);
      });
    });
    for (let i = runs.length; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.dirty) { s.ctx.setTransform(1, 0, 0, 1, 0, 0); s.ctx.clearRect(0, 0, s.el.width, s.el.height); s.dirty = false; }
      if (s.attached) { s.el.remove(); s.attached = false; delete s.el.dataset.parRun; }
    }
    this.compositeMs = performance.now() - t1;
  }

  /** Backing-store pixels of one canvas (the stage). */
  get stagePx(): number { return this.size.w * this.size.h; }

  /** Pixels the frame would fill with everything drawn (what the budget is compared with). */
  demandPx = 0;

  /** The items to leave out for `budget` (none when it fits). */
  private leave(runs: Run[], resolved: Array<Array<Sprite | Baked | null>>, budget: number): Set<DrawItem> {
    const cand: Candidate[] = [];
    const items: DrawItem[] = [];
    runs.forEach((run, i) => run.items.forEach((it, k) => {
      const sp = resolved[i][k];
      if (!sp) return;
      cand.push({ area: sp.w * sp.h, alpha: it.alpha, wasShed: this.shedIds.has(it.id) });
      items.push(it);
    }));
    this.demandPx = cand.reduce((n, c) => n + c.area, 0);
    const picked = pickShed(cand, budget);
    const out = new Set<DrawItem>();
    const ids = new Set<string>();
    picked.forEach((j) => { out.add(items[j]); ids.add(items[j].id); });
    this.shedIds = ids;
    this.shed = out.size;
    return out;
  }

  private baked(ctx: CanvasRenderingContext2D, it: DrawItem, sp: Baked): void {
    const f = this.size.f;
    ctx.setTransform(f, 0, 0, f, 0, 0);
    ctx.globalAlpha = Math.min(1, Math.max(0, it.alpha));
    ctx.drawImage(sp.canvas as CanvasImageSource, 0, 0, sp.w, sp.h, sp.x, sp.y, sp.w / f, sp.h / f);
  }

  private clip(ctx: CanvasRenderingContext2D, c: ClipShape): void {
    if (c.rect) {
      ctx.beginPath();
      ctx.rect(c.rect[0], c.rect[1], c.rect[2] - c.rect[0], c.rect[3] - c.rect[1]);
      ctx.clip();
    } else ctx.clip(this.path(c.d), c.evenodd ? 'evenodd' : 'nonzero');
  }

  private item(ctx: CanvasRenderingContext2D, it: DrawItem, sp: Sprite): void {
    const f = this.size.f;
    const s = it.size / it.spec.size;
    ctx.setTransform(f, 0, 0, f, 0, 0);
    ctx.save();
    for (const c of it.clip) this.clip(ctx, c);
    ctx.translate(it.org[0], it.org[1]);
    ctx.rotate(it.rot * DEG);
    ctx.translate(-it.org[0], -it.org[1]);
    // Box top-left (after alignment); the shear pivots there like the DOM path's box transform.
    ctx.translate(it.anchor[0] - it.ax * sp.boxW * s, it.anchor[1] - it.ay * it.size);
    if (it.shx !== 0 || it.shy !== 0) ctx.transform(1, it.shy, it.shx, 1, 0, 0);
    ctx.translate(sp.ox * s, sp.oy * s);
    ctx.globalAlpha = Math.min(1, Math.max(0, it.alpha));
    const k = s / it.spec.scale;
    ctx.drawImage(sp.canvas as CanvasImageSource, 0, 0, sp.w, sp.h, 0, 0, sp.w * k, sp.h * k);
    ctx.restore();
  }

  /** Drops canvases and paths (the stage is gone or the renderer is destroyed). */
  destroy(): void {
    for (const s of this.slots) { s.el.remove(); s.el.width = 0; s.el.height = 0; }
    this.slots.length = 0;
    this.paths.clear();
  }
}
