import { MinHeap } from './heap';

/** What the plan needs of the sprite cache: pinning. */
export interface Pins {
  pin(key: string): boolean;
  unpin(key: string): void;
}

/** What the plan wants of a sprite: held through `until` (last frame that may draw it), first drawn at `ms`. */
interface Want { until: number; ms: number }

/**
 * The promise side of the warm plan: a sprite wanted by an event that has not ended yet is kept resident until the last frame that may
 * draw it (`until`) has passed, whatever else is built meanwhile. A sprite that is not cached yet is pinned when it arrives (`wants`).
 * `check` answers the other half of the promise: which wanted sprites are NOT actually in the cache right now.
 */
export class Ahead {
  private readonly wanted = new Map<string, Want>();
  private readonly order = new MinHeap<{ ms: number; key: string }>((e) => e.ms);

  constructor(private readonly cache: Pins) {}

  get size(): number { return this.wanted.size; }

  /** The plan wants `key` up to `until` (ms), first drawn at `ms`: pins it now when it is cached, else when it lands. */
  hold(key: string, until: number, ms?: number): void {
    const had = this.wanted.get(key);
    if (had) {
      if (ms !== undefined && ms < had.ms) had.ms = ms;
      if (had.until >= until) return;
      had.until = until;
    } else this.wanted.set(key, { until, ms: ms ?? until });
    this.order.push({ ms: until, key });
    this.cache.pin(key);
  }

  wants(key: string): boolean { return this.wanted.has(key); }

  /** Pinned until `ms`, or undefined. */
  untilOf(key: string): number | undefined { return this.wanted.get(key)?.until; }

  /** Frames before `t` are over: sprites nobody will draw any more go back to the LRU. */
  release(t: number): void {
    for (let e = this.order.peek(); e && e.ms <= t; e = this.order.peek()) {
      this.order.pop();
      if (this.wanted.get(e.key)?.until === e.ms) { this.wanted.delete(e.key); this.cache.unpin(e.key); }
    }
  }

  /** The earliest first-draw time of a sprite the plan promised to a frame but the cache does not hold (Infinity: the promise is real). */
  check(cached: (key: string) => boolean): number {
    let out = Infinity;
    for (const [k, w] of this.wanted) if (w.ms < out && !cached(k)) out = w.ms;
    return out;
  }

  clear(): void {
    for (const k of this.wanted.keys()) this.cache.unpin(k);
    this.wanted.clear();
    this.order.clear();
  }
}
