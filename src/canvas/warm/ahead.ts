import { MinHeap } from './heap';

/** What the plan needs of the sprite cache: pinning. */
export interface Pins {
  pin(key: string): boolean;
  unpin(key: string): void;
}

/**
 * The promise side of the warm plan: a sprite wanted by an event that has not ended yet is kept resident until the last frame that may
 * draw it (`until`) has passed, whatever else is built meanwhile. A sprite that is not cached yet is pinned when it arrives (`wants`).
 */
export class Ahead {
  private readonly until = new Map<string, number>();
  private readonly order = new MinHeap<{ ms: number; key: string }>((e) => e.ms);

  constructor(private readonly cache: Pins) {}

  get size(): number { return this.until.size; }

  /** The plan wants `key` up to `until` (ms): pins it now when it is cached, else when it lands. */
  hold(key: string, until: number): void {
    const had = this.until.get(key);
    if (had !== undefined && had >= until) return;
    this.until.set(key, until);
    this.order.push({ ms: until, key });
    this.cache.pin(key);
  }

  wants(key: string): boolean { return this.until.has(key); }

  /** Pinned until `ms`, or undefined. */
  untilOf(key: string): number | undefined { return this.until.get(key); }

  /** Frames before `t` are over: sprites nobody will draw any more go back to the LRU. */
  release(t: number): void {
    for (let e = this.order.peek(); e && e.ms <= t; e = this.order.peek()) {
      this.order.pop();
      if (this.until.get(e.key) === e.ms) { this.until.delete(e.key); this.cache.unpin(e.key); }
    }
  }

  clear(): void {
    for (const k of this.until.keys()) this.cache.unpin(k);
    this.until.clear();
    this.order.clear();
  }
}
