import type { CanvasPath } from '../canvas/CanvasPath';
import type { WarmStats } from '../canvas/types';
import { SliceBudget } from '../canvas/warm/budget';
import { WarmPlanner, type Builder, type Entry, type Lines } from '../canvas/warm/planner';
import { createSpritePool } from '../canvas/workers/create';
import type { SpritePool, FaceInfo } from '../canvas/workers/pool';
import type { SpriteWorkers } from '../canvas/workers/size';
import type { LineEnv } from '../render/LineView';

/** No frame drawn for this long (ms) = nothing is playing: idle slices may be long. */
const IDLE_AFTER_MS = 120;
/** Look-ahead time taken inside a render itself (ms); the rest of the work is done by the pump between frames. */
const IN_FRAME_MS = 1.5;
/** Without canvas lines on screen, the look-ahead runs on every this-many-th render. */
const QUIET_EVERY = 6;

/**
 * Builds the sprites the next seconds need, ahead of the frame that draws them: the warm plan (`WarmPlanner`) says what and in which
 * order, a slice budget learned from this machine's frames says how long to work between frames, and the builder is a Worker pool
 * when there is one (sprites go there as jobs, come back as bitmaps) with the main thread as the fallback that is always complete.
 * `note` runs in every render; when work is left a message-task pump carries on between frames.
 */
export class Lookahead {
  private readonly planner = new WarmPlanner();
  private readonly budget = new SliceBudget();
  private pool: SpritePool | null = null;
  private poolOpt: SpriteWorkers | null = null;
  private faces: FaceInfo[] = [];
  private armed = false;
  private gen = 0;
  private lastDrawAt = 0;
  private lastRenderAt = 0;
  private lastT = 0;
  private lastEnv: LineEnv | null = null;
  private quiet = 0;
  private mainBuilt = 0;
  private fromWorkers = 0;

  constructor(private readonly path: CanvasPath, private readonly lines: () => Lines, private readonly workers: () => SpriteWorkers) {}

  /** Called by every render. `spentMs`: what the canvas draw cost (null: no canvas line on screen). */
  note(t: number, env: LineEnv, spentMs: number | null): void {
    if (!this.path.enabled) return;
    const now = performance.now();
    if (spentMs === null && this.quiet++ % QUIET_EVERY !== 0) return;
    [this.lastT, this.lastEnv] = [t, env];
    if (spentMs !== null) { this.budget.noteFrame(spentMs, this.lastRenderAt ? now - this.lastRenderAt : null); this.lastDrawAt = now; this.lastRenderAt = now; }
    this.run(IN_FRAME_MS);
  }

  private run(budgetMs: number): void {
    const env = this.lastEnv;
    if (!env) return;
    const pool = this.ensurePool();
    this.mainBuilt = 0;
    const t0 = performance.now();
    const w = this.planner.step(this.path, this.lastT, env, env.frameMs ?? 41.7, budgetMs, this.lines(), this.builder(pool));
    pool?.flush();
    if (this.mainBuilt > 0) this.budget.noteBuilds(this.mainBuilt, performance.now() - t0);
    if (w.more) this.arm();
  }

  private builder(pool: SpritePool | null): Builder {
    return {
      take: (e: Entry) => {
        if (pool?.ready && pool.accepts(e.spec)) {
          if (!pool.submit(e.key, e.spec)) return 'full';
          this.fromWorkers++;
          return 'done';
        }
        this.path.prebuild(e.key, e.spec);
        this.mainBuilt++;
        return 'done';
      },
    };
  }

  private ensurePool(): SpritePool | null {
    const opt = this.workers();
    if (opt !== this.poolOpt) {
      this.pool?.destroy();
      this.pool = null;
      this.poolOpt = opt;
      if (opt !== 'off') {
        this.pool = createSpritePool(opt, { built: (k, s) => { this.path.cache.put(k, s); }, free: () => { if (this.planner.queued > 0) this.arm(); }, failed: () => { this.pool = null; } });
        this.pool?.setFaces(this.faces);
      }
    }
    return this.pool;
  }

  /** The faces the page has loaded, so workers can register them (see `FontManager.shipFaces`). */
  setFaces(faces: FaceInfo[]): void {
    this.faces = faces;
    this.pool?.setFaces(faces);
  }

  private arm(): void {
    if (this.armed) return;
    this.armed = true;
    const gen = this.gen;
    const run = (): void => { if (gen === this.gen) this.pump(); };
    if (typeof MessageChannel === 'undefined') { setTimeout(run, 0); return; }
    // A message task, not `setTimeout(0)`: timers are clamped to 4 ms once nested, which left the pump idle two thirds of the time.
    const ch = new MessageChannel();
    ch.port1.onmessage = () => { ch.port1.close(); run(); };
    ch.port2.postMessage(0);
  }

  /** One slice between frames: sized from what recent frames cost while frames are drawn, long when nothing was drawn lately. */
  private pump(): void {
    this.armed = false;
    if (!this.lastEnv || !this.path.enabled) return;
    const playing = performance.now() - this.lastDrawAt < IDLE_AFTER_MS;
    this.run(this.budget.slice(playing, playing ? this.path.load : null));
  }

  stats(): WarmStats {
    return { workers: this.pool?.ready ? this.pool.size : 0, workerBuilt: this.pool?.received ?? 0, planQueued: this.planner.queued, aheadMB: Math.round(this.planner.aheadMB * 10) / 10, leadMs: Number.isFinite(this.planner.frontier) ? Math.round(this.planner.frontier - this.lastT) : 0, buildMs: Math.round(this.budget.perBuild * 1000) / 1000 };
  }

  /** Fonts changed or the stage was rebuilt, or a new script: the plan and the jobs in flight are stale. */
  clear(): void {
    this.planner.reset();
    this.pool?.invalidate();
    this.gen++;
    this.armed = false;
    this.lastEnv = null;
    this.quiet = 0;
  }

  dispose(): void {
    this.clear();
    this.pool?.destroy();
    this.pool = null;
    this.poolOpt = null;
  }
}
