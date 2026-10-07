import type { PreparedLine } from '../anim/Prepared';
import type { LineEnv } from '../render/LineView';
import type { Overlay } from '../render/Overlay';

import { bakeable, bakeKey, type Baked } from './bake';
import { CanvasLayer, type Resolved, type Run } from './CanvasLayer';
import { ShedController } from './shed';
import { analyzeLine, chooseMode, type Complexity } from './eligibility';
import type { Dropped } from './paint';
import { planLine } from './plan';
import { canvasSupported, type Sprite } from './raster';
import { SpriteCache } from './SpriteCache';
import { buildAhead } from './mainBuild';
import type { DrawItem, PathStats, RenderMode, SpriteSpec } from './types';

/** What a frame does when a sprite it needs is not ready: `hold` presents nothing new (the previous frame stays, nothing is half drawn), `partial` draws what is ready. Neither builds anything. */
export type Policy = 'hold' | 'partial';

export interface Routed {
  line: PreparedLine;
  /** ms since line start. */
  rel: number;
  canvas: boolean;
}

/**
 * The canvas path of a scene: decides which lines it draws (sticky per line), plans and draws them, owns the sprite cache.
 * The frame path is a lookup and a draw: it never builds a sprite, never measures text and never waits. What is not ready is
 * reported (`onMissing`) to the look-ahead, which builds it first; the frame is then held or drawn without it (`Policy`).
 */
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
  /** Items of the last frame whose sprites were not ready, items missed in all frames, frames held back. */
  missing = 0;
  missedTotal = 0;
  held = 0;
  /** Set by the look-ahead: the items a frame needed and did not find. */
  onMissing: (items: DrawItem[]) => void = () => undefined;

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

  /** Draws the canvas lines of this frame; `seq` is the whole visible sequence, so DOM lines split the canvas lines into runs. True when the frame is complete (every sprite was ready and it was drawn). */
  render(seq: readonly Routed[], env: LineEnv, policy: Policy = 'partial'): boolean {
    const f = env.devScale ?? 1;
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
    const { resolved, missing } = this.resolve(runs);
    this.missing = missing.length;
    this.missedTotal += missing.length;
    if (missing.length) this.onMissing(missing);
    if (missing.length && policy === 'hold') { this.held++; return false; }
    if (this.load === null) this.shedding.reset();
    else this.shedding.update(this.load, this.layer.demandPx, this.layer.stagePx, this.layer.compositeMs);
    this.layer.draw(runs, resolved, this.shedding.budget);
    return missing.length === 0;
  }

  /** The bitmaps of a frame: looked up, never built. The clip-cut version of a sprite is used when the look-ahead made it (the same pixels as clipping on the draw). */
  private resolve(runs: Run[]): { resolved: Resolved; missing: DrawItem[] } {
    const missing: DrawItem[] = [];
    const resolved = runs.map((run) => run.items.map((it): Sprite | Baked | null => {
      if (it.alpha < 0.004) return null;
      const sp = this.cache.lookup(it.key);
      if (sp === undefined) { missing.push(it); return null; }
      if (!sp) { this.skipped++; return null; }
      const c = bakeable(it);
      return (c && (this.cache.peek(bakeKey(it, c)) as Baked | null | undefined)) || sp;
    }));
    return { resolved, missing };
  }

  /** Look-ahead build (page thread): not counted as a draw-time miss. */
  prebuild(key: string, spec: SpriteSpec): void { buildAhead(this.cache, key, spec); }

  stats(): PathStats {
    return {
      sprites: this.cache.size, spriteBytes: this.cache.bytes, spriteHits: this.cache.hits, spriteMisses: this.cache.misses, prewarmed: this.cache.prewarmed,
      evictions: this.cache.evictions, detailDropped: this.dropped.blur, skipped: this.skipped, runs: this.runs, runsMerged: this.merged, drawn: this.layer.drawn, shed: this.layer.shed, shedBudgetMpx: this.shedding.budget < Infinity ? Math.round(this.shedding.budget / 1e4) / 100 : 0, fillMpx: Math.round(this.layer.fillPx / 1e4) / 100,
      missing: this.missing, missedTotal: this.missedTotal, held: this.held, compositeMs: Math.round(this.layer.compositeMs * 100) / 100,
    };
  }

  /** Fonts changed or the stage was rebuilt: bitmaps and sticky decisions are stale. */
  clear(): void {
    this.cache.clear();
    this.cache.sweep();
    this.modes.clear();
    this.layer.draw([], []);
  }

  destroy(): void {
    this.clear();
    this.layer.destroy();
  }
}
