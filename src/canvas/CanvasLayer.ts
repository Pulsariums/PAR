import type { ClipShape } from '../render/clipCss';
import type { Size } from '../layout/Layout';
import type { Overlay } from '../render/Overlay';

import type { Baked } from './bake';
import { filterPx, filterUserSpace } from './filterSpace';
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
const NO_SHED = new Set<DrawItem>();

const sameNum = (a: number, b: number): boolean => a === b; // NaN never equals: an unset value forces a repaint, never a wrong skip
const samePoint = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/** Every field the composite reads from a draw item (the sprite itself is compared by object identity). */
const sameItem = (a: DrawItem, b: DrawItem): boolean =>
  a.id === b.id && a.index === b.index && a.layer === b.layer && a.key === b.key &&
  sameNum(a.alpha, b.alpha) && samePoint(a.anchor, b.anchor) && samePoint(a.org, b.org) &&
  sameNum(a.rot, b.rot) && sameNum(a.size, b.size) && sameNum(a.ax, b.ax) && sameNum(a.ay, b.ay) &&
  sameNum(a.shx, b.shx) && sameNum(a.shy, b.shy) && sameNum(a.blur ?? 0, b.blur ?? 0) &&
  sameNum(a.rx ?? 1, b.rx ?? 1) && a.still === b.still &&
  a.spec.size === b.spec.size && a.spec.scale === b.spec.scale &&
  a.clip.length === b.clip.length &&
  a.clip.every((c, i) => {
    const d = b.clip[i];
    return (c.rect === d.rect || (c.rect !== undefined && d.rect !== undefined && samePoint(c.rect, d.rect))) &&
      c.d === d.d && c.evenodd === d.evenodd &&
      (c.bbox === d.bbox || (c.bbox !== undefined && d.bbox !== undefined && samePoint(c.bbox, d.bbox)));
  });

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
  /** The last frame that was really composed: same inputs mean the stage already shows them, and clear+draw again would only repaint. */
  private prevFrame: { runs: Run[]; resolved: Resolved; budget: number } | null = null;
  /** Optional diagnostics hook; unset in normal playback. */
  onMarker: CanvasMarker | null = null;
  private readonly profileHooks: SlotProfile = {
    stateChange: () => { if (this.profile) this.profile.stateChanges++; },
    drawOp: () => { if (this.profile) this.profile.drawOps++; },
  };

  constructor(overlay: Overlay, readonly maxRuns = 6) {
    this.slots = new Slots(overlay, maxRuns);
    // A context that was lost and comes back shows a blank canvas: whatever the skip thinks the stage still shows is gone.
    this.slots.onRestored = () => { this.prevFrame = null; };
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

  resize(layout: Size, f: number): void {
    // A stage resize clears and re-fits every backing store: the pixels of the last composed frame are gone, so it is no longer a match.
    if (this.slots.needsResize(layout, f)) this.prevFrame = null;
    this.slots.resize(layout, f);
  }

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
    // Nothing the stage shows has changed since the last real compose: same runs, same draw items (keys, transforms, alpha, clip),
    // same bitmaps, same budget. Repainting would clear the stage and draw the identical pixels again — the ending pays that every
    // display frame between two subtitle frames. Only trusted when no diagnostics hook is watching (markers must see every compose)
    // and when no slot lost its 2D context (a lost-and-restored canvas comes back blank: the pixels the skip believes are there are
    // gone, and only a repaint brings them back); the counters keep the last frame's values because the picture is the picture.
    if (this.prevFrame && !this.profile && !this.onMarker && !this.slots.lost() && this.sameFrame(this.prevFrame, runs, resolved, budget)) return;
    this.resetOperationCounts();
    this.drawn = 0;
    this.fillPx = 0;
    const t0 = performance.now();
    const left = this.leave(runs, resolved, budget);
    let unavailable = false;
    runs.forEach((run, i) => {
      const ctx = this.slots.open(i, run.layer, run.index);
      if (!ctx) {
        unavailable = true;
        if (this.onMarker) {
          const at = performance.now();
          for (const it of run.items) this.onMarker(it, 'unavailable', at, at);
        }
        return;
      }
      run.items.forEach((it, k) => {
        const sp = resolved[i][k];
        if (!sp) {
          this.drawn++;
          const started = this.onMarker ? performance.now() : 0;
          this.fallbackItem(ctx, it);
          if (this.onMarker) this.onMarker(it, 'rendered', started, performance.now());
          return;
        }
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
    // Remember what the stage shows now. A run whose canvas could not open left part of the frame undrawn — nothing may be
    // "skipped as already painted" against that. An empty frame is not a picture worth remembering either.
    this.prevFrame = !unavailable && runs.length ? { runs, resolved, budget } : null;
  }

  /** Same stage contents: identical runs, draw items and resolved bitmaps (object identity: a cached sprite is immutable) at the same budget. */
  private sameFrame(prev: { runs: Run[]; resolved: Resolved; budget: number }, runs: Run[], resolved: Resolved, budget: number): boolean {
    if (prev.budget !== budget || prev.runs.length !== runs.length) return false;
    for (let i = 0; i < runs.length; i++) {
      const a = prev.runs[i];
      const b = runs[i];
      if (a.layer !== b.layer || a.index !== b.index || a.items.length !== b.items.length) return false;
      for (let k = 0; k < b.items.length; k++) if (!sameItem(a.items[k], b.items[k]) || prev.resolved[i][k] !== resolved[i][k]) return false;
    }
    return true;
  }

  /** The items to leave out for `budget` (none when it fits). */
  private leave(runs: Run[], resolved: Resolved, budget: number): Set<DrawItem> {
    if (!(budget < Infinity)) {
      let demand = 0;
      for (let i = 0; i < runs.length; i++) {
        const items = runs[i].items;
        for (let k = 0; k < items.length; k++) {
          const sp = resolved[i][k];
          if (sp) demand += sp.w * sp.h;
        }
      }
      this.demandPx = demand;
      this.shedIds.clear();
      this.shed = 0;
      return NO_SHED;
    }
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
    const rxScale = (it.rx && it.spec.rx) ? it.rx / it.spec.rx : 1;
    ctx.setTransform(f, 0, 0, f, 0, 0);
    this.stateChange();
    // Transform and alpha are set for every item; only clipping needs a saved state.
    const clipped = it.clip.length > 0;
    if (clipped) {
      ctx.save();
      this.stateChange();
    }
    for (const c of it.clip) this.clip(ctx, c);
    // Rotation about `org`: with \frz 0 the translate-rotate-translate triplet is the exact identity (a translate and its inverse
    // cancel in floating point), so it is skipped — fewer state changes on the many still frames of a dense ending, pixel for pixel.
    if (it.rot !== 0) {
      ctx.translate(it.org[0], it.org[1]);
      this.stateChange();
      ctx.rotate(it.rot * DEG);
      this.stateChange();
      ctx.translate(-it.org[0], -it.org[1]);
      this.stateChange();
    }
    // Box top-left (after alignment); the shear pivots there like the DOM path's box transform.
    ctx.translate(it.anchor[0] - it.ax * sp.boxW * s * rxScale, it.anchor[1] - it.ay * it.size);
    this.stateChange();
    if (it.shx !== 0 || it.shy !== 0) {
      ctx.transform(1, it.shy, it.shx, 1, 0, 0);
      this.stateChange();
    }
    ctx.translate(sp.ox * s * rxScale, sp.oy * s);
    this.stateChange();
    ctx.globalAlpha = Math.min(1, Math.max(0, it.alpha));
    this.stateChange();
    const k = s / it.spec.scale;
    // Draw-time blur of an animated `\blur`: the plate is sharp and its `spec.pad` margin holds the tail, so the exact per-frame
    // sigma is a device-space filter around this single drawImage. The bitmap lands on the stage scaled by `f * s` device px per
    // bitmap px, and a baked sigma of `it.blur * spec.scale` device px would have scaled the same way: same pixels on screen.
    // Whether Chromium multiplies `ctx.filter` lengths by the CTM (user space, which would make `f` count twice) is settled by the
    // runtime probe in `filterSpace.ts`, not by spec readings; `filterPx` divides the radius back out only where that is the case.
    const blurPx = it.blur ? it.blur * f * s : 0;
    if (blurPx > 0) {
      ctx.filter = `blur(${filterPx(blurPx, f, filterUserSpace())}px)`;
      this.stateChange();
    }
    ctx.drawImage(sp.canvas as CanvasImageSource, 0, 0, sp.w, sp.h, 0, 0, sp.w * k * rxScale, sp.h * k);
    this.drawImage();
    if (blurPx > 0) {
      ctx.filter = 'none';
      this.stateChange();
    }
    if (clipped) {
      ctx.restore();
      this.stateChange();
    }
  }

  private fallbackItem(ctx: CanvasRenderingContext2D, it: DrawItem): void {
    const f = this.slots.f;
    const spec = it.spec;
    ctx.save();
    this.stateChange();

    ctx.setTransform(f, 0, 0, f, 0, 0);
    this.stateChange();

    for (const c of it.clip) this.clip(ctx, c);

    if (it.rot !== 0) {
      ctx.translate(it.org[0], it.org[1]);
      this.stateChange();
      ctx.rotate(it.rot * DEG);
      this.stateChange();
      ctx.translate(-it.org[0], -it.org[1]);
      this.stateChange();
    }

    if (it.shx !== 0 || it.shy !== 0) {
      ctx.transform(1, it.shy, it.shx, 1, 0, 0);
      this.stateChange();
    }

    const fontPx = it.size * (spec.ratio ?? 1);
    ctx.font = `${spec.italic ? 'italic ' : ''}${spec.weight} ${fontPx}px ${spec.family}`;
    if ('fontKerning' in ctx) (ctx as any).fontKerning = spec.kerning ? 'auto' : 'none';
    if ('letterSpacing' in ctx) (ctx as any).letterSpacing = `${spec.spacing}px`;
    ctx.textBaseline = 'alphabetic';
    this.stateChange();

    const tm = typeof ctx.measureText === 'function' ? ctx.measureText(spec.text) : null;
    const asc = tm?.fontBoundingBoxAscent ?? tm?.actualBoundingBoxAscent ?? fontPx * 0.8;
    const desc = tm?.fontBoundingBoxDescent ?? tm?.actualBoundingBoxDescent ?? fontPx * 0.2;
    const cell = asc + desc;
    const baseline = cell > 0 ? (it.size * asc) / cell : (it.size - cell) / 2 + asc;
    const boxW = (tm?.width ?? 0) * (spec.rx ?? 1);

    ctx.translate(it.anchor[0] - it.ax * boxW, it.anchor[1] - it.ay * it.size);
    this.stateChange();

    const rx = (it.rx && spec.rx) ? it.rx : (spec.rx ?? 1);
    if (typeof ctx.scale === 'function' && rx !== 1) {
      ctx.scale(rx, 1);
      this.stateChange();
    }

    ctx.globalAlpha = Math.min(1, Math.max(0, it.alpha));
    this.stateChange();

    ctx.lineJoin = 'miter';
    ctx.miterLimit = 4;
    for (const p of spec.plates) {
      if (p.shadow) {
        if (p.strokeW > 0) {
          ctx.lineWidth = p.strokeW;
          ctx.strokeStyle = p.shadow.colour;
          if (typeof ctx.strokeText === 'function') ctx.strokeText(spec.text, p.dx + p.shadow.dx, baseline + p.dy + p.shadow.dy);
          this.drawOp();
        }
        ctx.fillStyle = p.shadow.colour;
        if (typeof ctx.fillText === 'function') ctx.fillText(spec.text, p.dx + p.shadow.dx, baseline + p.dy + p.shadow.dy);
        this.drawOp();
      }
      if (p.stroke && p.strokeW > 0) {
        ctx.lineWidth = p.strokeW;
        ctx.strokeStyle = p.stroke;
        if (typeof ctx.strokeText === 'function') ctx.strokeText(spec.text, p.dx, baseline + p.dy);
        this.drawOp();
      }
      if (p.fill) {
        ctx.fillStyle = p.fill;
        if (typeof ctx.fillText === 'function') ctx.fillText(spec.text, p.dx, baseline + p.dy);
        this.drawOp();
      }
    }

    ctx.restore();
    this.stateChange();
  }

  private stateChange(): void { if (this.profile) this.profile.stateChanges++; }

  private drawOp(): void {
    if (!this.profile) return;
    this.profile.drawOps++;
  }

  private drawImage(): void {
    if (!this.profile) return;
    this.profile.drawImages++;
    this.profile.drawOps++;
  }

  /** Drops canvases and paths (the stage is gone or the renderer is destroyed). */
  destroy(): void {
    this.slots.destroy();
    this.paths.clear();
    this.prevFrame = null;
  }
}
