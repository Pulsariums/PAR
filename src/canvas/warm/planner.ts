import type { PreparedLine } from '../../anim/Prepared';
import type { LineEnv } from '../../render/LineView';
import type { CanvasPath } from '../CanvasPath';
import { estimateBytes } from '../cost';
import { AUTO_LOAD } from '../eligibility';
import { spriteRequests } from '../sprites';
import type { SpriteSpec } from '../types';

import { MinHeap } from './heap';

/** How far ahead (ms of subtitle time) sprites are planned. A window that is not loaded that far ends the plan where it ends. */
export const HORIZON_MS = 10_000;
const CHUNK_MS = 500;
const MAX_QUEUE = 20_000;
const MAX_PLANNED = 150_000;
/** A jump of the playhead beyond this (forward) or this much back is a seek: the plan starts over from the new time. */
const SEEK_FORWARD_MS = 3000;
const SEEK_BACK_MS = 150;
/** Share of the sprite cache that built-ahead, not yet used sprites may fill: the rest is room for what drawing builds itself. */
export const AHEAD_SHARE = 0.5;

/** One sprite the plan wants built: first drawn at `ms` (absolute). */
export interface Entry { key: string; spec: SpriteSpec; ms: number; bytes: number }

/** What the plan reads of the script's timeline (`Timeline` plus whether a time is loaded in a windowed script). */
export interface Lines {
  startingIn(aMs: number, bMs: number): PreparedLine[];
  visibleAt(tMs: number): PreparedLine[];
  startMs(l: PreparedLine): number;
  covers: ((tMs: number) => boolean) | null;
}

/** Where entries get built: `'full'` = cannot take more right now (the caller is told when to try again). */
export interface Builder { take(e: Entry): 'done' | 'full' }

export interface Warmed {
  /** Entries handed to the builder in this slice. */
  built: number;
  /** Work is left that this slice had no time for. */
  more: boolean;
  /** Stopped because the builder is full (it reports when it frees up). */
  waiting: boolean;
}

/**
 * The warm plan: a time-ordered queue of the sprites the next seconds need (key, spec, first-use time), built nearest first.
 * It is filled lazily, in time slices, from the lines the window holds (`startingIn` chunks of 500 ms), using `spriteRequests`, the same
 * derivation drawing and the analyzer use. Entries are ordered by when a sprite is first drawn, not by when its event starts, so the
 * first frames of a burst come before the late frames of events already running. Sprites built ahead and not yet due are counted against
 * a share of the cache (`AHEAD_SHARE`): nothing is planned that the cache could not hold next to what is needed sooner.
 * A seek (time jumps) starts the plan over at the new time instead of replaying it.
 */
export class WarmPlanner {
  private readonly heap = new MinHeap<Entry>((e) => e.ms);
  private readonly due = new MinHeap<{ ms: number; bytes: number }>((d) => d.ms);
  private planned = new Set<string>();
  private aheadBytes = 0;
  /** Everything starting up to here is in the queue (or was skipped as unwanted). */
  private complete = NaN;
  private lastT = NaN;
  private pending: PreparedLine[] = [];
  private pi = 0;
  private pendingMin = -Infinity;
  private pendingWanted = false;
  private pendingEnd = NaN;
  /** Times the plan started over (seeks), for tests and the report. */
  restarts = 0;

  get queued(): number { return this.heap.size; }
  get frontier(): number { return this.complete; }
  get aheadMB(): number { return this.aheadBytes / 1048576; }

  reset(): void {
    this.heap.clear();
    this.due.clear();
    this.planned.clear();
    this.aheadBytes = 0;
    this.pending = [];
    this.pi = 0;
    this.complete = NaN;
    this.lastT = NaN;
  }

  step(path: CanvasPath, t: number, env: LineEnv, frameMs: number, budgetMs: number, lines: Lines, builder: Builder): Warmed {
    const t0 = performance.now();
    const left = (): number => budgetMs - (performance.now() - t0);
    if (!Number.isFinite(this.lastT) || t < this.lastT - SEEK_BACK_MS || t > this.lastT + SEEK_FORWARD_MS) this.restart(t, lines);
    this.lastT = t;
    while (this.due.size > 0 && this.due.peek()!.ms <= t) this.aheadBytes -= this.due.pop()!.bytes;
    if (this.planned.size > MAX_PLANNED) this.planned.clear();
    const expanding = this.expand(path, t, env, frameMs, lines, left);
    const out = this.build(path, left, builder);
    return { built: out.built, more: out.more || (expanding && left() <= 0), waiting: out.waiting };
  }

  private restart(t: number, lines: Lines): void {
    this.reset();
    this.restarts++;
    this.complete = t;
    // Lines already running still have frames ahead; they come first, then everything that starts after `t`.
    this.pending = lines.visibleAt(t);
    this.pendingMin = t - 1;
    this.pendingEnd = t;
    this.pendingWanted = true;
  }

  /** Plans lines in time chunks until the horizon, the queue cap, the end of the loaded window or the time slice. True while it could go on. */
  private expand(path: CanvasPath, t: number, env: LineEnv, frameMs: number, lines: Lines, left: () => number): boolean {
    for (;;) {
      while (this.pi < this.pending.length) {
        if (left() <= 0) return true;
        if (this.pendingWanted) this.plan(path, this.pending[this.pi], env, frameMs, lines);
        this.pi++;
      }
      this.pending = [];
      this.pi = 0;
      if (Number.isFinite(this.pendingEnd)) { this.complete = this.pendingEnd; this.pendingEnd = NaN; this.pendingMin = -Infinity; }
      if (this.complete >= t + HORIZON_MS || this.heap.size >= MAX_QUEUE || left() <= 0) return this.complete < t + HORIZON_MS && this.heap.size < MAX_QUEUE;
      const a = this.complete, b = Math.min(a + CHUNK_MS, t + HORIZON_MS);
      if (lines.covers && !lines.covers(b - 1)) return false;
      this.pending = lines.startingIn(a, b);
      this.pendingEnd = b;
      this.pendingWanted = this.wanted(path, t, this.pending);
    }
  }

  /** Same rule the old look-ahead used: forced canvas, canvas lines on screen lately, or a chunk heavy enough that `auto` will route it to the canvas. */
  private wanted(path: CanvasPath, t: number, chunk: readonly PreparedLine[]): boolean {
    if (path.mode() === 'canvas' || path.busy(t)) return true;
    let load = 0;
    for (const l of chunk) {
      const c = path.complexity(l);
      if (c.eligible && (load += c.score) >= AUTO_LOAD) return true;
    }
    return false;
  }

  private plan(path: CanvasPath, line: PreparedLine, env: LineEnv, frameMs: number, lines: Lines): void {
    const c = path.complexity(line);
    if (!c.eligible) return;
    for (const r of spriteRequests(line, env, c.animated, frameMs, lines.startMs(line))) {
      if (r.ms < this.pendingMin || this.planned.has(r.key)) continue;
      this.planned.add(r.key);
      if (path.cache.peek(r.key) !== undefined) continue;
      this.heap.push({ key: r.key, spec: r.spec, ms: r.ms, bytes: estimateBytes(r.spec) });
    }
  }

  private build(path: CanvasPath, left: () => number, builder: Builder): { built: number; more: boolean; waiting: boolean } {
    const cap = path.cache.capBytes * AHEAD_SHARE;
    let built = 0;
    for (let e = this.heap.peek(); e && e.ms <= this.complete; e = this.heap.peek()) {
      if (path.cache.peek(e.key) !== undefined) { this.heap.pop(); continue; }
      if (left() <= 0) return { built, more: true, waiting: false };
      if (this.aheadBytes > 0 && this.aheadBytes + e.bytes > cap) return { built, more: false, waiting: false };
      if (builder.take(e) === 'full') return { built, more: false, waiting: true };
      this.heap.pop();
      this.aheadBytes += e.bytes;
      this.due.push({ ms: e.ms, bytes: e.bytes });
      built++;
    }
    return { built, more: false, waiting: false };
  }
}
