import type { ClipShape } from '../render/clipCss';
import type { Size } from '../layout/Layout';
import type { Overlay } from '../render/Overlay';

import type { Baked } from './bake';
import { Slots, type SlotProfile } from './layerSlots';
import { pickShed, type Candidate } from './shed';
import type { Sprite } from './raster';
import type { DrawItem } from './types';

export type CanvasMarkerOutcome = 'rendered' | 'shed' | 'skipped' | 'missing' | 'held' | 'unavailable';
export type CanvasMarker = (item: DrawItem, outcome: CanvasMarkerOutcome, start: number, end: number) => void;

/** Items of consecutive canvas events (in layer / file order): they share one canvas, DOM lines keep their place between runs. */
export interface Run {
  layer: number;
  index: number;
  items: DrawItem[];
}

/** Bitmaps of a frame, in the shape of its runs (null: nothing to draw for that item). */
export type Resolved = Array<Array<Sprite | Baked | null>>;

const DEG = Math.PI / 180;
const isBaked = (sp: Sprite | Baked): sp is Baked => 'x' in sp;
const MAX_PATHS = 1024;

interface LayerProfile extends SlotProfile {
  drawImages: number;
  drawOps: number;
  stateChanges: number;
}

/**
 * Draws a frame whose sprites are all resolved: one `drawImage` per item with its transform, opacity and clip, no DOM per event and no
 * building. The frame path only ever looks bitmaps up (see `CanvasPath`); pixels leave the stage only through here.
 */
export class CanvasLayer {
  private readonly slots: Slots;
  private readonly paths = new Map<string, Path2D>();
  /** Items drawn and device pixels covered by the last `draw`. */
  drawn = 0;
  fillPx = 0;
  /** Items of the last frame that were left out to meet the pixel budget (see `shed.ts`), and the ids of the ones left out last frame. */
  shed = 0;
  /** Last frame: time to draw the finished sprites (shedding only acts on this). */
  compositeMs = 0;
  /** Pixels the frame would fill with everything drawn (what the budget is compared with). */
  demandPx = 0;
  private shedIds = new Set<string>();
  private profile: LayerProfile | null = null;
  /** Optional diagnostics hook; unset in normal playback. */
  onMarker: CanvasMarker | null = null;
  private readonly profileHooks: SlotProfile = {
    stateChange: () => { if (this.profile) this.profile.stateChanges++; },
    drawOp: () => { if (this.profile) this.profile.drawOps++; },
  };

  constructor(overlay: Overlay, readonly maxRuns = 6) {
    this.slots = new Slots(overlay, maxRuns);
  }

  setProfiling(enabled: boolean): void {
    this.profile = enabled ? { drawImages: 0, drawOps: 0, stateChanges: 0, ...this.profileHooks } as LayerProfile : null;
    this.slots.setProfile(enabled ? this.profileHooks : null);
  }

  resetOperationCounts(): void {
    if (!this.profile) return;
    this.profile.drawImages = 0;
    this.profile.drawOps = 0;
    this.profile.stateChanges = 0;
  }

  operationCounts(): Pick<LayerProfile, 'drawImages' | 'drawOps' | 'stateChanges'> {
    return { drawImages: this.profile?.drawImages ?? 0, drawOps: this.profile?.drawOps ?? 0, stateChanges: this.profile?.stateChanges ?? 0 };
  }

  get stagePx(): number { return this.slots.stagePx; }

  resize(layout: Size, f: number): void { this.slots.resize(layout, f); }

  private path(d: string): Path2D {
    let p = this.paths.get(d);
    if (!p) {
      if (this.paths.size >= MAX_PATHS) this.paths.clear();
      this.paths.set(d, (p = new Path2D(d)));
    }
    return p;
  }

  /**
   * Draws the runs (canvas i = run i) and frees the canvases no run needs. `resolved` has the bitmap of every item (null = skip it).
   * `budget` caps the pixels filled in one frame: past it the least visible items are left out (Infinity = draw everything).
   */
  draw(runs: Run[], resolved: Resolved, budget = Infinity): void {
    this.resetOperationCounts();
    this.drawn = 0;
    this.fillPx = 0;
    const t0 = performance.now();
    const left = this.leave(runs, resolved, budget);
    runs.forEach((run, i) => {
      const ctx = this.slots.open(i, run.layer, run.index);
      if (!ctx) {
        if (this.onMarker) {
          const at = performance.now();
          for (const it of run.items) this.onMarker(it, 'unavailable', at, at);
        }
        return;
      }
      run.items.forEach((it, k) => {
        const sp = resolved[i][k];
        if (!sp) return;
        if (left.has(it)) {
          if (this.onMarker) {
            const at = performance.now();
            this.onMarker(it, 'shed', at, at);
          }
          return;
        }
        this.drawn++;
        this.fillPx += sp.w * sp.h;
        const started = this.onMarker ? performance.now() : 0;
        if (isBaked(sp)) this.baked(ctx, it, sp);
        else this.item(ctx, it, sp);
        if (this.onMarker) this.onMarker(it, 'rendered', started, performance.now());
      });
    });
    this.slots.closeFrom(runs.length);
    this.compositeMs = performance.now() - t0;
  }

  /** The items to leave out for `budget` (none when it fits). */
  private leave(runs: Run[], resolved: Resolved, budget: number): Set<DrawItem> {
    const cand: Candidate[] = [];
    const items: DrawItem[] = [];
    runs.forEach((run, i) => run.items.forEach((it, k) => {
      const sp = resolved[i][k];
      if (!sp) return;
      cand.push({ area: sp.w * sp.h, alpha: it.alpha, wasShed: this.shedIds.has(it.id) });
      items.push(it);
    }));
    this.demandPx = cand.reduce((n, c) => n + c.area, 0);
    const out = new Set<DrawItem>();
    const ids = new Set<string>();
    pickShed(cand, budget).forEach((j) => { out.add(items[j]); ids.add(items[j].id); });
    this.shedIds = ids;
    this.shed = out.size;
    return out;
  }

  private baked(ctx: CanvasRenderingContext2D, it: DrawItem, sp: Baked): void {
    const f = this.slots.f;
    ctx.setTransform(f, 0, 0, f, 0, 0);
    this.stateChange();
    ctx.globalAlpha = Math.min(1, Math.max(0, it.alpha));
    this.stateChange();
    ctx.drawImage(sp.canvas as CanvasImageSource, 0, 0, sp.w, sp.h, sp.x, sp.y, sp.w / f, sp.h / f);
    this.drawImage();
  }

  private clip(ctx: CanvasRenderingContext2D, c: ClipShape): void {
    if (c.rect) {
      ctx.beginPath();
      ctx.rect(c.rect[0], c.rect[1], c.rect[2] - c.rect[0], c.rect[3] - c.rect[1]);
      ctx.clip();
      this.stateChange();
    } else {
      ctx.clip(this.path(c.d), c.evenodd ? 'evenodd' : 'nonzero');
      this.stateChange();
    }
  }

  private item(ctx: CanvasRenderingContext2D, it: DrawItem, sp: Sprite): void {
    const f = this.slots.f;
    const s = it.size / it.spec.size;
    ctx.setTransform(f, 0, 0, f, 0, 0);
    this.stateChange();
    // Transform and alpha are set for every item; only clipping needs a saved state.
    const clipped = it.clip.length > 0;
    if (clipped) {
      ctx.save();
      this.stateChange();
    }
    for (const c of it.clip) this.clip(ctx, c);
    ctx.translate(it.org[0], it.org[1]);
    this.stateChange();
    ctx.rotate(it.rot * DEG);
    this.stateChange();
    ctx.translate(-it.org[0], -it.org[1]);
    this.stateChange();
    // Box top-left (after alignment); the shear pivots there like the DOM path's box transform.
    ctx.translate(it.anchor[0] - it.ax * sp.boxW * s, it.anchor[1] - it.ay * it.size);
    this.stateChange();
    if (it.shx !== 0 || it.shy !== 0) {
      ctx.transform(1, it.shy, it.shx, 1, 0, 0);
      this.stateChange();
    }
    ctx.translate(sp.ox * s, sp.oy * s);
    this.stateChange();
    ctx.globalAlpha = Math.min(1, Math.max(0, it.alpha));
    this.stateChange();
    const k = s / it.spec.scale;
    ctx.drawImage(sp.canvas as CanvasImageSource, 0, 0, sp.w, sp.h, 0, 0, sp.w * k, sp.h * k);
    this.drawImage();
    if (clipped) {
      ctx.restore();
      this.stateChange();
    }
  }

  private stateChange(): void { if (this.profile) this.profile.stateChanges++; }

  private drawImage(): void {
    if (!this.profile) return;
    this.profile.drawImages++;
    this.profile.drawOps++;
  }

  /** Drops canvases and paths (the stage is gone or the renderer is destroyed). */
  destroy(): void {
    this.slots.destroy();
    this.paths.clear();
  }
}
