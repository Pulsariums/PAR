import type { PreparedLine } from '../anim/Prepared';
import type { LineEnv } from '../render/LineView';
import type { Overlay } from '../render/Overlay';

import { bake, bakeable, bakeKey, type Baked } from './bake';
import { CanvasLayer, type Run } from './CanvasLayer';
import { ShedController } from './shed';
import { analyzeLine, chooseMode, type Complexity } from './eligibility';
import type { Dropped } from './paint';
import { planLine } from './plan';
import { construct } from './construct';
import { canvasSupported, type Sprite } from './raster';
import { SpriteCache } from './SpriteCache';
import type { DrawItem, PathStats, RenderMode, SpriteSpec } from './types';

/** Time one frame may spend building sprites it needs now; then blurs are left out (counted); at twice that, new sprites wait for the next frame. */
export const BUILD_BUDGET_MS = 8;

export interface Routed {
  line: PreparedLine;
  /** ms since line start. */
  rel: number;
  canvas: boolean;
}

/** The canvas path of a scene: decides which lines it draws (sticky per line), plans and draws them, owns the sprite cache. */
export class CanvasPath {
  private readonly layer: CanvasLayer;
  readonly cache: SpriteCache<Sprite>;
  private readonly info = new WeakMap<PreparedLine, Complexity>();
  private modes = new Map<string, 'dom' | 'canvas'>();
  private scale = 0;
  private readonly dropped: Dropped = { blur: 0 };
  private skipped = 0;
  private merged = 0;
  private runs = 0;
  private busyUntil = -1;
  private readonly shedding = new ShedController();
  /** Share of recent display frames that came late while playing (null = not playing: full quality). */
  load: number | null = null;
  /** Items of the last frame that were drawn reduced or not at all because the frame ran out of build time. */
  deferred = 0;

  constructor(overlay: Overlay, readonly mode: () => RenderMode, capBytes: number) {
    this.layer = new CanvasLayer(overlay);
    this.cache = new SpriteCache<Sprite>(capBytes);
  }

  get enabled(): boolean { return this.mode() !== 'dom' && canvasSupported(); }

  complexity(line: PreparedLine): Complexity {
    let c = this.info.get(line);
    if (!c) this.info.set(line, (c = analyzeLine(line)));
    return c;
  }

  /** True while canvas lines were on screen recently (upcoming qualifying lines are then warmed up). */
  busy(nowMs: number): boolean { return nowMs <= this.busyUntil; }

  /** Mode of every visible line (new lines are decided by the scene's load, then keep it for their whole life). */
  route(visible: readonly PreparedLine[], nowMs: number): boolean[] {
    if (!this.enabled) { this.modes.clear(); return visible.map(() => false); }
    const next = new Map<string, 'dom' | 'canvas'>();
    let load = -1;
    const out = visible.map((l) => {
      let m = this.modes.get(l.event.id);
      if (!m) {
        const c = this.complexity(l);
        if (load < 0) load = visible.reduce((n, v) => n + (this.complexity(v).eligible ? this.complexity(v).score : 0), 0);
        m = chooseMode(this.mode(), c, load, this.busy(nowMs));
      }
      next.set(l.event.id, m);
      return m === 'canvas';
    });
    this.modes = next;
    if (out.some(Boolean)) this.busyUntil = nowMs + 2000;
    return out;
  }

  /** Draws the canvas lines of this frame; `seq` is the whole visible sequence, so DOM lines split the canvas lines into runs. */
  render(seq: readonly Routed[], env: LineEnv): void {
    const f = env.devScale ?? 1;
    this.deferred = 0;
    // Sprites carry their scale in the key; the first render must keep what the look-ahead built before any canvas line was on screen.
    if (this.scale !== 0 && f !== this.scale) this.cache.clear();
    this.scale = f;
    this.cache.sweep();
    this.layer.resize(env.layout, f);
    const runs: Run[] = [];
    let open: Run | null = null;
    for (const r of seq) {
      if (!r.canvas) { open = null; continue; }
      const it = planLine(r.line, r.rel, env, this.complexity(r.line).animated, this.dropped);
      if (!open) {
        if (runs.length >= this.layer.maxRuns) { open = runs[runs.length - 1]; this.merged++; } else runs.push((open = { layer: it.layer, index: it.index, items: [] }));
      }
      open.items.push(it);
    }
    this.runs = runs.length;
    const t0 = performance.now();
    if (this.load === null) this.shedding.reset();
    else this.shedding.update(this.load, this.layer.demandPx, this.layer.stagePx, this.layer.compositeMs);
    this.layer.draw(runs, (it) => this.sprite(it, t0), this.shedding.budget);
  }

  /** Sprite of an item; past the build budget the blur is dropped (sharp sprites are far cheaper to build). */
  private sprite(it: DrawItem, t0: number): Sprite | Baked | null {
    const sp = this.base(it, t0);
    const c = sp ? bakeable(it) : null;
    // Past the build budget the clip is applied on the draw instead of baking (same pixels, no build time).
    if (!sp || !c || performance.now() - t0 >= BUILD_BUDGET_MS) return sp;
    const key = bakeKey(it, c);
    const hit = this.cache.peek(key);
    if (hit !== undefined) return hit as Baked | null;
    return this.cache.getOrBuild(key, () => bake(it, sp, c)) as Baked | null;
  }

  private base(it: DrawItem, t0: number): Sprite | null {
    const hit = this.cache.peek(it.key);
    if (hit !== undefined) { this.cache.hits++; if (!hit) this.skipped++; return hit; }
    const spent = performance.now() - t0;
    if (spent < BUILD_BUDGET_MS) return this.build(it.key, it.spec);
    // Far over budget (a burst of new events): draw the rest next frame instead of freezing this one; counted in `skipped`.
    if (spent >= 2 * BUILD_BUDGET_MS) { this.skipped++; this.deferred++; return null; }
    const sharp: SpriteSpec = { ...it.spec, plates: it.spec.plates.map((p) => ({ ...p, blur: 0 })) };
    if (sharp.plates.some((p, i) => p.blur !== it.spec.plates[i].blur)) { this.dropped.blur++; this.deferred++; }
    return this.build(`${it.key}#sharp`, sharp);
  }

  build(key: string, spec: SpriteSpec): Sprite | null {
    const s = this.cache.getOrBuild(key, () => this.construct(spec));
    if (!s) this.skipped++;
    return s;
  }

  /** Builds a sprite; plain single-colour ones are tinted from a shared white mask kept in the cache (see `construct.ts`). */
  private construct(spec: SpriteSpec): Sprite | null {
    return construct(spec, { peek: (k) => this.cache.peek(k), store: (k, build) => this.cache.store(k, build, false) });
  }

  /** Lookahead build: not counted as a draw-time miss. */
  prebuild(key: string, spec: SpriteSpec): void {
    this.cache.store(key, () => this.construct(spec));
  }

  stats(): PathStats {
    return {
      sprites: this.cache.size, spriteBytes: this.cache.bytes, spriteHits: this.cache.hits, spriteMisses: this.cache.misses, prewarmed: this.cache.prewarmed,
      evictions: this.cache.evictions, detailDropped: this.dropped.blur, skipped: this.skipped, runs: this.runs, runsMerged: this.merged, drawn: this.layer.drawn, shed: this.layer.shed, shedBudgetMpx: this.shedding.budget < Infinity ? Math.round(this.shedding.budget / 1e4) / 100 : 0, fillMpx: Math.round(this.layer.fillPx / 1e4) / 100,
    };
  }

  /** Fonts changed or the stage was rebuilt: bitmaps and sticky decisions are stale. */
  clear(): void {
    this.cache.clear();
    this.cache.sweep();
    this.modes.clear();
    this.layer.draw([], () => null);
  }

  destroy(): void {
    this.clear();
    this.layer.destroy();
  }
}
