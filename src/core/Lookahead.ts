import type { CanvasPath } from '../canvas/CanvasPath';
import { estimateBuildMs } from '../canvas/cost';
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
/** While workers are starting, sprites needed later than this (ms ahead of the playhead) wait for them instead of being built on the page thread. */
const BOOT_WAIT_MS = 1500;

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
  private poolTried = false;
  private replan = false;
  private faces: FaceInfo[] = [];
  private armed = false;
  private gen = 0;
  private lastDrawAt = 0;
  private lastRenderAt = 0;
  private lastT = 0;
  private lastEnv: LineEnv | null = null;
  private quiet = 0;
  private mainBuilt = 0;
  private mainEst = 0;
  private fromWorkers = 0;

  constructor(private readonly path: CanvasPath, private readonly lines: () => Lines, private readonly workers: () => SpriteWorkers) {
    path.pending = (key) => this.pool?.age(key) ?? null;
  }

  /** Called by every render. `spentMs`: what the canvas draw cost (null: no canvas line on screen). */
  note(t: number, env: LineEnv, spentMs: number | null): void {
    if (!this.path.enabled) return;
    const now = performance.now();
    if (spentMs === null && this.quiet++ % QUIET_EVERY !== 0) return;
    [this.lastT, this.lastEnv] = [t, env];
    if (spentMs !== null) { this.budget.noteFrame(spentMs, this.lastRenderAt ? now - this.lastRenderAt : null); this.lastDrawAt = now; this.lastRenderAt = now; }
    this.run(IN_FRAME_MS, false);
  }

  private run(budgetMs: number, exempt = true): void {
    const env = this.lastEnv;
    if (!env) return;
    this.syncOption();
    if (this.replan) { this.planner.reset(); this.replan = false; }
    // A seek starts a new plan: what the workers were still building for the old one is not wanted (nor counted against the ahead share).
    if (this.planner.isSeek(this.lastT)) this.pool?.invalidate();
    this.mainBuilt = 0;
    this.mainEst = 0;
    const t0 = performance.now();
    const w = this.planner.step(this.path, this.lastT, env, env.frameMs ?? 41.7, budgetMs, this.lines(), this.builder(), exempt);
    this.pool?.flush();
    if (this.mainBuilt > 0) this.budget.noteBuilds(this.mainBuilt, performance.now() - t0, this.mainEst);
    if (w.more) this.arm();
  }

  /** Where an entry goes: a worker, the main thread, or nowhere yet (workers are starting and the sprite is not needed soon). */
  private route(e: Entry): 'pool' | 'wait' | 'main' {
    const pool = this.pool ?? this.spawn();
    if (!pool || pool.dead) return 'main';
    if (pool.booting) return e.ms - this.lastT > BOOT_WAIT_MS ? 'wait' : 'main';
    return pool.ready && pool.accepts(e.spec, e.key) ? 'pool' : 'main';
  }

  private builder(): Builder {
    return {
      take: (e: Entry) => {
        const r = this.route(e);
        if (r === 'wait') return 'full';
        if (r === 'pool') {
          if (!this.pool!.submit(e.key, e.spec)) return 'full';
          this.fromWorkers++;
          return 'done';
        }
        this.path.prebuild(e.key, e.spec);
        this.mainBuilt++;
        this.mainEst += estimateBuildMs(e.spec);
        return 'done';
      },
      cost: (e: Entry) => (this.route(e) === 'main' ? this.budget.scaled(estimateBuildMs(e.spec)) : 0),
    };
  }

  /** The option changed: the pool of the old one goes (a new one is started when something is first planned for it). */
  private syncOption(): void {
    const opt = this.workers();
    if (opt === this.poolOpt) return;
    this.pool?.destroy();
    [this.pool, this.poolOpt, this.poolTried] = [null, opt, false];
  }

  /** Workers are started with the first sprite that could use them, not when a script merely plays (a page with no canvas lines never pays for threads). */
  private spawn(): SpritePool | null {
    if (this.poolTried || this.poolOpt === 'off') return null;
    this.poolTried = true;
    this.pool = createSpritePool(this.poolOpt ?? 'auto', {
      // Arrivals happen between frames, never inside a draw: bitmaps this one pushed out can be closed now (a paused or hidden page draws nothing to sweep them).
      built: (k, s) => { this.path.cache.put(k, s); this.path.cache.sweep(); },
      free: () => { if (this.planner.queued > 0) this.arm(); },
      // Whatever was handed to the dead workers will never arrive: plan again, the main thread builds it.
      failed: () => { this.pool = null; this.replan = true; this.arm(); },
    });
    this.pool?.setFaces(this.faces);
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
    // A hidden tab draws nothing and the playhead does not move: the plan has what it needs, no more CPU for it.
    if (!this.lastEnv || !this.path.enabled || (typeof document !== 'undefined' && document.hidden)) return;
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
    this.replan = false;
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
