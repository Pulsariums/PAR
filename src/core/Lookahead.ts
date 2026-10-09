import type { CanvasPath } from '../canvas/CanvasPath';
import { estimateBuildMs } from '../canvas/cost';
import type { DrawItem, WarmStats } from '../canvas/types';
import { SliceBudget } from '../canvas/warm/budget';
import { WarmPlanner, type Builder, type Entry, type Lines } from '../canvas/warm/planner';
import { Throughput } from '../canvas/warm/rate';
import { createSpritePool } from '../canvas/workers/create';
import type { SpritePool, FaceInfo } from '../canvas/workers/pool';
import type { SpriteWorkers } from '../canvas/workers/size';
import type { LineEnv } from '../render/LineView';

/** No frame drawn for this long (ms) = nothing is playing: idle slices may be long. */
const IDLE_AFTER_MS = 120;
/** Without canvas lines on screen, the look-ahead runs on every this-many-th render. */
const QUIET_EVERY = 6;
/** While workers are starting, sprites needed later than this (ms ahead of the playhead) wait for them instead of being built on the page thread. */
const BOOT_WAIT_MS = 1500;
/** Safety margin (frames) between a sprite landing and the frame that draws it, for the deficit estimate. */
const MARGIN_FRAMES = 2;
/** Default look-ahead window (ms), adjustable at runtime through `range`. */
export const COLD_RANGE_MS = 30000;
export const COLD_SLICE_MS = 4;

/**
 * Builds the sprites the coming frames need, ahead of the frame that draws them. The warm plan (`WarmPlanner`) says what and in
 * which order, as far ahead as the sprite memory allows; the builder is a Worker pool when there is one (jobs go there with their
 * priority, bitmaps come back) and the page thread otherwise, in slices sized from this machine's frames (`SliceBudget`). Throughput is
 * measured (`Throughput`), so how long the playhead would have to wait to never be late is known (`deficit`). A frame that finds a
 * sprite missing reports it (`urgent`): it jumps the queue and `onReady` fires when everything that frame lacked has landed.
 */
export class Lookahead {
  private readonly planner: WarmPlanner;
  private readonly budget = new SliceBudget();
  private readonly rate = new Throughput(0.3);
  private pool: SpritePool | null = null;
  private poolOpt: SpriteWorkers | null = null;
  private poolTried = false;
  private range = COLD_RANGE_MS;
  private replan = false;
  private faces: FaceInfo[] = [];
  private armed = false;
  private paintTask: number | null = null;
  private gen = 0;
  private lastDrawAt = 0;
  private lastRenderAt = 0;
  private lastT = 0;
  private lastEnv: LineEnv | null = null;
  private quiet = 0;
  private mainBuilt = 0;
  private mainEst = 0;
  private fromWorkers = 0;
  private waiting = new Set<string>();
  /** The plan has things to build and nothing is working on them (no job out, no slice coming): a frame waiting for them would wait forever. */
  stuck = false;
  /** A frame that was missing sprites now has all of them. */
  onReady: () => void = () => undefined;

  constructor(private readonly path: CanvasPath, private readonly lines: () => Lines, private readonly workers: () => SpriteWorkers) {
    this.planner = new WarmPlanner(path);
    path.onMissing = (items) => this.urgent(items);
  }

  /** How far ahead (subtitle ms) live preparation plans. */
  setRange(ms: number): void {
    this.range = Math.max(1000, Math.min(300_000, ms));
  }

  /** Force-prepare scenes above this pending line count (temperature). */
  setTemperature(n: number): void { this.planner.setTemperature(n); }

  /** Start of a render at `t`: a jump of the playhead starts the plan over there (what the workers still build for the old one is not wanted). */
  begin(t: number, env: LineEnv): void {
    if (!this.path.enabled) return;
    this.lastEnv = env;
    if (this.planner.isSeek(t)) { this.clear(); this.lastEnv = env; this.planner.seek(t, this.lines()); }
    this.lastT = t;
  }

  /** End of a render. `spentMs`: what the canvas draw cost (null: no canvas line on screen). */
  note(t: number, env: LineEnv, spentMs: number | null): void {
    if (!this.path.enabled) return;
    const now = performance.now();
    if (spentMs === null && this.quiet++ % QUIET_EVERY !== 0) return;
    this.begin(t, env);
    if (spentMs !== null) { this.budget.noteFrame(spentMs, this.lastRenderAt ? now - this.lastRenderAt : null); this.lastDrawAt = now; this.lastRenderAt = now; }
    // Background planning starts after paint; only a frame's missing sprites are urgent.
    this.arm();
  }

  /** The frame needed these and did not find them: prioritize them for the next between-frame slice. */
  private urgent(items: DrawItem[]): void {
    if (!this.lastEnv) return;
    this.waiting = new Set(items.map((i) => i.key));
    for (const it of items) {
      this.planner.urgent(it.key, it.spec, this.lastT);
      this.pool?.prioritize(it.key);
    }
    // Do not build synchronously from CanvasPath.render; the current frame must finish first.
    this.arm();
  }

  private run(budgetMs: number, exempt = true): void {
    const env = this.lastEnv;
    if (!env) return;
    this.syncOption();
    if (this.replan) { this.planner.seek(this.lastT, this.lines()); this.replan = false; }
    this.mainBuilt = 0;
    this.mainEst = 0;
    const t0 = performance.now();
    const w = this.planner.step(this.lastT, env, env.frameMs ?? 41.7, budgetMs, this.lines(), this.builder(), exempt, this.range);
    this.pool?.flush();
    if (this.mainBuilt > 0) this.budget.noteBuilds(this.mainBuilt, performance.now() - t0, this.mainEst);
    this.measure();
    this.stuck = this.planner.queued > 0 && !w.more && !w.waiting && this.planner.inFlight === 0 && w.built === 0;
    if (w.more) this.arm();
  }

  private measure(): void {
    const c = this.planner.takeDone();
    if (c > 0) this.rate.done(c);
    if (this.planner.pending === 0) this.rate.idle();
  }

  /** Where an entry goes: a worker, the main thread, or nowhere yet (workers are starting and the sprite is not needed soon). */
  private route(e: Entry): 'pool' | 'wait' | 'main' {
    const pool = this.pool ?? this.spawn();
    if (!pool || pool.dead) return 'main';
    if (pool.booting) return e.ms - this.lastT > BOOT_WAIT_MS && e.prio >= 0 ? 'wait' : 'main';
    return pool.ready && pool.accepts(e.spec, e.key) ? 'pool' : 'main';
  }

  private builder(): Builder {
    return {
      take: (e: Entry) => {
        const r = this.route(e);
        if (r === 'wait') return 'full';
        if (r === 'pool') {
          if (!this.pool!.submit(e.key, e.spec, e.prio)) return 'full';
          this.rate.busy();
          this.fromWorkers++;
          return 'done';
        }
        this.path.prebuild(e.key, e.spec);
        this.mainBuilt++;
        this.mainEst += estimateBuildMs(e.spec);
        this.rate.busy();
        this.noteLanded(e.key);
        return 'done';
      },
      cost: (e: Entry) => (this.route(e) === 'main' ? this.budget.scaled(estimateBuildMs(e.spec)) : 0),
    };
  }

  /** A sprite is available: when it was the last one a held frame lacked, the frame can be drawn. */
  private noteLanded(key: string): void {
    if (this.waiting.delete(key) && this.waiting.size === 0) this.onReady();
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
      built: (k, s) => { this.path.cache.put(k, s, this.planner.ahead.wants(k)); this.path.cache.sweep(); this.planner.landed(k); this.measure(); this.noteLanded(k); },
      builtBatch: (items) => {
        for (const { key, sprite } of items) {
          this.path.cache.put(key, sprite, this.planner.ahead.wants(key));
          this.planner.landed(key);
          this.noteLanded(key);
        }
        this.path.cache.sweep();
        this.measure();
      },
      // A worker could not build it (a face it lacks, an exception): the page thread does, same key, same pixels.
      refused: (k) => { this.planner.requeue(k); this.arm(); },
      free: () => { if (this.lastEnv) this.arm(); },
      // Whatever was handed to the dead workers will never arrive: plan again, the main thread builds it.
      failed: () => { this.pool = null; this.replan = true; this.arm(); },
    });
    this.pool?.setFaces(this.faces);
    if (this.pool) this.rate.guess = Math.max(0.3, this.pool.size * 0.7);
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
    const task = (): void => {
      if (gen !== this.gen) return;
      this.paintTask = null;
      if (typeof MessageChannel === 'undefined') { setTimeout(run, 0); return; }
      const ch = new MessageChannel();
      ch.port1.onmessage = () => { ch.port1.close(); ch.port2.close(); run(); };
      ch.port2.postMessage(0);
    };
    // rAF alone runs before paint; the message task after it keeps cold work off first paint.
    if (typeof requestAnimationFrame === 'function') this.paintTask = requestAnimationFrame(task);
    else setTimeout(task, 0);
  }

  /** One bounded slice between frames, reduced further when recent frames are under load. */
  private pump(): void {
    this.armed = false;
    // A hidden tab draws nothing and the playhead does not move: the plan has what it needs, no more CPU for it.
    if (!this.lastEnv || !this.path.enabled || (typeof document !== 'undefined' && document.hidden)) return;
    const playing = performance.now() - this.lastDrawAt < IDLE_AFTER_MS;
    this.run(Math.min(COLD_SLICE_MS, this.budget.slice(playing, playing ? this.path.load : null)));
  }

  /** Workers are building: only then can the builders be faster than the clock, so only then is holding the picture for them worth it. */
  get hasWorkers(): boolean { return !!this.pool?.ready; }

  /** Ms the playhead would have to wait (from `t`) for every planned sprite to be built before its frame, at the measured throughput. 0 = playing on is safe. */
  deficit(t: number): number {
    const frame = this.lastEnv?.frameMs ?? 41.7;
    return this.planner.frontier.deficit(t, this.rate.value, MARGIN_FRAMES * frame);
  }

  stats(): WarmStats {
    const f = this.planner.planned;
    return {
      workers: this.pool?.ready ? this.pool.size : 0, workerBuilt: this.pool?.received ?? 0, planQueued: this.planner.queued, aheadMB: Math.round(this.planner.aheadMB * 10) / 10,
      leadMs: Number.isFinite(f) ? Math.round(f - this.lastT) : 0, buildMs: Math.round(this.budget.perBuild * 1000) / 1000,
      pending: this.planner.pending, readyMs: Math.min(1e9, Math.round(this.planner.readyUntil() - this.lastT)), rate: Math.round(this.rate.value * 1000) / 1000, deficitMs: Math.round(this.deficit(this.lastT)),
    };
  }

  /** Fonts changed or the stage was rebuilt, or a new script: the plan and the jobs in flight are stale. */
  clear(): void {
    this.gen++;
    if (this.paintTask !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.paintTask);
    this.paintTask = null;
    this.armed = false;
    this.lastEnv = null;
    this.planner.reset();
    this.pool?.invalidate();
    this.replan = false;
    this.quiet = 0;
    this.waiting.clear();
    this.rate.idle();
  }

  dispose(): void {
    this.clear();
    this.pool?.destroy();
    this.pool = null;
    this.poolOpt = null;
  }
}
