import type { LineEnv } from '../../render/LineView';
import type { CanvasPath } from '../CanvasPath';
import { bakeAhead } from '../mainBuild';
import { estimateBuildMs, estimateBytes } from '../cost';
import type { SpriteReq } from '../sprites';
import type { ClipShape } from '../../render/clipCss';
import type { DrawItem, SpriteSpec } from '../types';

import { Ahead } from './ahead';
import { Expander, MAX_SLICE_REQUESTS, type Lines } from './expand';
import { Frontier } from './frontier';
import { MinHeap } from './heap';

export type { Lines } from './expand';

/** How far ahead (ms of subtitle time) the plan may look; queue admission remains tightly bounded below. */
export const HORIZON_MS = 60_000;
/** Bound pending variants so dense animated scripts cannot monopolize the cache or worker mailboxes. */
const MAX_QUEUE = 512;
const MAX_BAKES = 5000;
/** A jump of the playhead beyond this (forward) or this much back is a seek: the plan starts over from the new time. */
const SEEK_FORWARD_MS = 3000;
const SEEK_BACK_MS = 150;
/** Share of the sprite cache that sprites promised to later frames may hold: the rest is room for what was drawn lately. */
export const AHEAD_SHARE = 0.5;
/** Sprites needed within this many ms may use the whole cache, not only the ahead share (the frame is about to need them). */
const IMMINENT_MS = 600;

/** One sprite the plan wants built: first drawn at `ms` (absolute), possibly drawn until `until`. `prio` orders the queue (urgent sprites go first). */
export interface Entry { key: string; spec: SpriteSpec; ms: number; until: number; bytes: number; cost: number; prio: number }

/** Where entries get built: `'full'` = cannot take more right now (the caller is told when to try again). `cost`: page-thread ms the entry would take (0 when it goes to a worker). */
export interface Builder { take(e: Entry): 'done' | 'full'; cost(e: Entry): number }

interface BakeJob { base: string; key: string; item: DrawItem; clip: ClipShape; until: number }

export interface Warmed {
  /** Entries handed to the builder in this slice. */
  built: number;
  /** Work is left that this slice had no time for. */
  more: boolean;
  /** Stopped because the builder is full (it reports when it frees up). */
  waiting: boolean;
}

/**
 * The warm plan: a time-ordered queue of the sprites the coming frames need (key, spec, first-use time), built in the order they are
 * first drawn. It reads the script lazily, in time slices, as far ahead as the sprite memory allows: sprites promised to later frames
 * are pinned in the cache (`Ahead`) until their last frame, so what has been built is never pushed out by what is built next, and
 * planning stops when the pinned and in-flight sprites fill `AHEAD_SHARE` of the cache; it goes on as frames pass and release them.
 * `Frontier` knows what is still pending, by time, so the playhead's distance to the first missing sprite and the wait the builders
 * would need to catch up are known at any moment. A seek starts the plan over at the new time. A frame that finds a sprite missing
 * reports it (`urgent`) and it goes to the front.
 */
export class WarmPlanner {
  readonly frontier = new Frontier();
  readonly ahead: Ahead;
  private readonly heap = new MinHeap<Entry>((e) => e.prio);
  private readonly expander = new Expander();
  private readonly inflight = new Map<string, Entry>();
  private inflightBytes = 0;
  private queuedBytes = 0;
  private bakes: BakeJob[] = [];
  private readonly bakeKeys = new Set<string>();
  private lastT = NaN;
  private frameMs = 41.7;
  /** The next chunk of a windowed script is not loaded yet: planning cannot go further. */
  blocked = false;
  /** Times the plan started over (seeks), for tests and the report. */
  restarts = 0;
  /** Estimated work (ms) finished since the last `takeDone`, for the throughput measurement. */
  private doneCost = 0;

  constructor(private readonly path: CanvasPath) { this.ahead = new Ahead(path.cache); }

  get queued(): number { return this.heap.size; }
  get pending(): number { return this.frontier.size; }
  /** Everything starting up to here is planned. */
  get planned(): number { return this.expander.frontier; }
  get aheadMB(): number { return (this.path.cache.pinnedBytes + this.inflightBytes) / 1048576; }

  /** Ms up to which every sprite the plan knows of is available (the plan's own frontier when none is pending). */
  readyUntil(): number { const f = this.expander.frontier; return Math.min(this.frontier.first - 1, this.blocked || !Number.isFinite(f) ? Infinity : f); }

  /** `t` is not where the playhead was heading (a jump, or the first look): the next `step` starts the plan over there. */
  isSeek(t: number): boolean { return !Number.isFinite(this.lastT) || t < this.lastT - SEEK_BACK_MS || t > this.lastT + SEEK_FORWARD_MS; }

  reset(): void {
    this.heap.clear();
    this.frontier.clear();
    this.ahead.clear();
    this.expander.reset();
    this.bakes = [];
    this.bakeKeys.clear();
    this.inflight.clear();
    [this.inflightBytes, this.queuedBytes, this.doneCost, this.lastT] = [0, 0, 0, NaN];
    this.blocked = false;
  }

  /** The playhead is somewhere else (see `isSeek`) or this is the first look: the plan starts over at `t`. */
  seek(t: number, lines: Lines): void {
    this.reset();
    this.restarts++;
    this.expander.restart(t, lines);
    this.lastT = t;
  }

  step(t: number, env: LineEnv, frameMs: number, budgetMs: number, lines: Lines, builder: Builder, exempt = true, rangeMs = HORIZON_MS): Warmed {
    const t0 = performance.now();
    const left = (): number => budgetMs - (performance.now() - t0);
    this.lastT = t;
    this.frameMs = frameMs;
    this.ahead.release(t - frameMs);
    const share = this.path.cache.capBytes * AHEAD_SHARE;
    const room = (): boolean => this.heap.size < MAX_QUEUE && this.path.cache.pinnedBytes + this.inflightBytes + this.queuedBytes < share * 1.25;
    const planLeft = (): number => budgetMs / 2 - (performance.now() - t0);
    const r = this.expander.run(this.path, t, env, frameMs, lines, t + Math.min(HORIZON_MS, rangeMs), room, planLeft, (q) => this.want(q, t));
    this.blocked = r.blocked;
    const out = this.build(t, left, builder, exempt);
    const baking = this.bake(left);
    return { built: out.built, more: out.more || r.more || baking, waiting: out.waiting };
  }

  /** One sprite the plan wants: promised until its last frame, queued when it is not cached or on its way. */
  private want(r: SpriteReq, t: number): void {
    if (r.until < t) return;
    this.ahead.hold(r.key, r.until);
    if (r.bake) {
      const existing = this.bakes.find((b) => b.key === r.bake!.key);
      if (existing) existing.until = Math.max(existing.until, r.until);
      else if (this.bakes.length < MAX_BAKES) {
        this.bakes.push({ base: r.key, ...r.bake, until: r.until });
        this.bakeKeys.add(r.bake.key);
      }
    }
    if (this.path.cache.has(r.key) || this.frontier.has(r.key)) return;
    this.push({ key: r.key, spec: r.spec, ms: r.ms, until: r.until, bytes: estimateBytes(r.spec), cost: estimateBuildMs(r.spec), prio: r.ms });
  }

  private push(e: Entry): void {
    this.heap.push(e);
    this.queuedBytes += e.bytes;
    this.frontier.add(e.key, e.ms, e.cost);
  }

  /** A frame found this sprite missing: it goes to the front (`t`: the playhead). */
  urgent(key: string, spec: SpriteSpec, t: number): void {
    if (this.path.cache.has(key) || this.inflight.has(key)) return;
    this.ahead.hold(key, t + IMMINENT_MS * 3);
    if (this.frontier.has(key)) {
      this.heap.update((e) => e.key === key, (e) => { e.ms = Math.min(e.ms, t); e.prio = -1; });
      this.frontier.add(key, t, estimateBuildMs(spec));
      return;
    }
    this.push({ key, spec, ms: t, until: t + IMMINENT_MS * 3, bytes: estimateBytes(spec), cost: estimateBuildMs(spec), prio: -1 });
  }

  /** The sprite is available now (built here, or delivered by a worker; `null` sprites count too: nothing more to wait for). */
  landed(key: string): void {
    const f = this.inflight.get(key);
    if (f) { this.inflight.delete(key); this.inflightBytes -= f.bytes; this.doneCost += f.cost; }
    if (this.ahead.wants(key)) this.path.cache.pin(key);
    this.frontier.done(key);
  }

  /** Clip-cut bitmaps for sprites that exist now (the rest wait for their sprite). True when time ran out with some still doable. */
  private bake(left: () => number): boolean {
    const cache = this.path.cache;
    const keep: BakeJob[] = [];
    let i = 0;
    for (; i < this.bakes.length; i++) {
      const b = this.bakes[i];
      if (b.until < this.lastT) { this.bakeKeys.delete(b.key); continue; }
      if (cache.has(b.key)) { this.bakeKeys.delete(b.key); this.ahead.hold(b.key, b.until); continue; }
      if (!cache.peek(b.base)) { keep.push(b); continue; }
      if (left() <= 0) break;
      if (bakeAhead(cache, b.key, b.item, b.clip)) { this.bakeKeys.delete(b.key); this.ahead.hold(b.key, b.until); }
    }
    const more = i < this.bakes.length;
    this.bakes = more ? keep.concat(this.bakes.slice(i)) : keep;
    return more;
  }

  /** A builder could not build a sprite it was given (a worker without the font): it goes back to the queue, front first, for the page thread. */
  requeue(key: string): void {
    const e = this.inflight.get(key);
    if (!e) return;
    this.inflight.delete(key);
    this.inflightBytes -= e.bytes;
    this.heap.push({ ...e, prio: -1 });
    this.queuedBytes += e.bytes;
  }

  /** Estimated work (ms) finished since the last call. */
  takeDone(): number { const c = this.doneCost; this.doneCost = 0; return c; }

  /** Work handed over but not delivered (a pool that died: it never will be): back into the queue is the caller's job (`reset`). */
  get inFlight(): number { return this.inflight.size; }

  private build(t: number, left: () => number, builder: Builder, exempt: boolean): { built: number; more: boolean; waiting: boolean } {
    const cache = this.path.cache;
    let built = 0;
    for (let e = this.heap.peek(); e && (e.prio < 0 || e.ms <= this.expander.pendingUntil + 2 * this.frameMs); e = this.heap.peek()) {
      if (cache.has(e.key)) { this.heap.pop(); this.queuedBytes -= e.bytes; this.frontier.done(e.key); if (this.ahead.wants(e.key)) cache.pin(e.key); continue; }
      if (left() <= 0 || built >= MAX_SLICE_REQUESTS) return { built, more: true, waiting: false };
      const used = cache.pinnedBytes + this.inflightBytes;
      const cap = cache.capBytes * (e.ms <= t + IMMINENT_MS ? 1 : AHEAD_SHARE);
      if (used > 0 && used + e.bytes > cap) return { built, more: false, waiting: false };
      if (builder.cost(e) > left() && (built > 0 || !exempt)) return { built, more: true, waiting: false };
      if (builder.take(e) === 'full') return { built, more: false, waiting: true };
      this.heap.pop();
      this.queuedBytes -= e.bytes;
      if (!cache.has(e.key)) { this.inflight.set(e.key, e); this.inflightBytes += e.bytes; } else { this.doneCost += e.cost; this.landed(e.key); }
      built++;
    }
    return { built, more: false, waiting: false };
  }
}
