import type { SourceStats, SubtitleSource } from '../source/types';
import { inWindow } from '../source/window';
import type { AssEvent } from '../types/script';

import { msOf } from './time';

export interface SourceStatsReport {
  /** Events held in memory right now. */
  windowEvents: number;
  /** Loaded time range [from, to) in seconds, or null before the first window arrived. */
  windowRange: [number, number] | null;
  /** A read is in flight. */
  loading: boolean;
  bytesRead: number;
  decodeMs: number;
  indexMs: number;
}

/** After a seek / at the start: the first read only covers the frames about to be shown (ms). */
const QUICK_BACK = 100;
const QUICK_AHEAD = 400;

export interface FeedHooks {
  /** The window changed: events added / removed (by `index`). */
  onChange(added: AssEvent[], removed: number[]): void;
  onError(e: unknown): void;
}

/**
 * Sliding window over a `SubtitleSource`: keeps events for [t - back, t + ahead] (ms, `windowSeconds` = back + ahead, 1/6 back),
 * refills ahead in slices before the playhead gets there (a seek first loads only the next 0.5 s), cancels reads a seek made stale, and evicts what fell behind.
 * `covers(t)` tells the renderer whether the lines at `t` are really loaded: when they are not (after a seek) it draws nothing
 * instead of the wrong lines. Every compare is on integer ms (see `time.ts`).
 */
export class WindowFeed {
  private readonly ev = new Map<number, AssEvent>();
  private lo = 0;
  private hi = 0;
  private has = false;
  private req: { id: number; a: number; b: number; ac: AbortController } | null = null;
  private seq = 0;
  private dead = false;
  private retryAt = 0;
  private lastT = 0;
  private readonly back: number;
  private readonly ahead: number;
  /** Longest forward read: the window grows in slices so playback never waits for one big read. */
  private readonly slice: number;

  constructor(readonly source: SubtitleSource, private readonly hooks: FeedHooks, windowSeconds = 12) {
    const total = Math.max(1000, Math.round(windowSeconds * 1000));
    this.back = Math.round(total / 6);
    this.ahead = total - this.back;
    this.slice = Math.max(1000, Math.round(this.ahead / 4));
  }

  get events(): AssEvent[] { return [...this.ev.values()]; }

  covers(tMs: number): boolean { return this.has && tMs >= this.lo && tMs < this.hi; }

  /** Called with the current time on every draw: plans the next read. Cheap when nothing is due. */
  update(tMs: number): void {
    if (this.dead || performance.now() < this.retryAt) return;
    if (this.has && tMs - this.back - this.lo >= 1000) this.evict(tMs);
    // Last seek wins: a read the playhead has left (a seek far away, then another) is cancelled, not waited for.
    if (this.req && (tMs < this.req.a - this.ahead || tMs >= this.req.b + this.ahead)) { this.req.ac.abort(); this.req = null; }
    const r = this.req;
    const backward = tMs < this.lastT;
    this.lastT = tMs;
    if (!this.covers(tMs)) {
      if (!(r && r.a <= tMs && tMs < r.b)) this.load(tMs - QUICK_BACK, tMs + QUICK_AHEAD);
    } else if (r) return;
    else if (this.hi - tMs < this.ahead / 2 && this.hi < msOf(this.source.duration) + 1) this.load(this.hi, Math.min(tMs + this.ahead, this.hi + this.slice));
    else if (backward && tMs - this.lo < this.back / 8 && this.lo > 0) this.load(tMs - this.back, this.lo);
  }

  stats(): SourceStatsReport {
    const s: SourceStats = this.source.stats?.() ?? { bytesRead: 0, decodeMs: 0 };
    return {
      windowEvents: this.ev.size, windowRange: this.has ? [this.lo / 1000, this.hi / 1000] : null, loading: this.req !== null,
      bytesRead: s.bytesRead, decodeMs: s.decodeMs, indexMs: s.indexMs ?? 0,
    };
  }

  dispose(): void {
    this.dead = true;
    this.req?.ac.abort();
    this.req = null;
    this.source.close?.();
  }

  private load(a: number, b: number): void {
    this.req?.ac.abort();
    const ac = new AbortController();
    const req = { id: ++this.seq, a: Math.max(0, a), b, ac };
    this.req = req;
    this.source.readWindow(req.a / 1000, b / 1000, ac.signal).then((events) => {
      if (this.dead || this.req !== req) return;
      this.req = null;
      this.apply(req.a, req.b, events);
    }, (e) => {
      if (this.req === req) this.req = null;
      if (this.dead || ac.signal.aborted) return;
      this.retryAt = performance.now() + 1000;
      this.hooks.onError(e);
    });
  }

  private apply(a: number, b: number, events: AssEvent[]): void {
    const removed: number[] = [];
    const added: AssEvent[] = [];
    if (!(this.has && a <= this.hi && b >= this.lo)) {
      this.ev.forEach((_e, i) => removed.push(i));
      this.ev.clear();
      [this.lo, this.hi, this.has] = [a, b, true];
    } else [this.lo, this.hi] = [Math.min(this.lo, a), Math.max(this.hi, b)];
    for (const e of events) {
      if (!inWindow(e, a / 1000, b / 1000) || this.ev.has(e.index)) continue;
      this.ev.set(e.index, e);
      added.push(e);
    }
    this.hooks.onChange(added, removed);
  }

  /** Drops events that ended before `t - back` (or start after `t + 1.5 * ahead`); the covered range shrinks to match. */
  private evict(tMs: number): void {
    const from = tMs - this.back;
    const to = tMs + Math.round(this.ahead * 1.5);
    if (!this.has || (this.lo >= from && this.hi <= to)) return;
    const removed: number[] = [];
    for (const [i, e] of this.ev) if (msOf(e.end) <= from || msOf(e.start) >= to) { this.ev.delete(i); removed.push(i); }
    this.lo = Math.max(this.lo, from);
    this.hi = Math.min(this.hi, to);
    if (removed.length) this.hooks.onChange([], removed);
  }
}
