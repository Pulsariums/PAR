import { MinHeap } from './heap';

/** Resolution of the cost-by-time bins (ms of subtitle time). */
const BIN = 50;

/**
 * The sprites planned and not yet available (queued for building or in a worker), by the time they are first drawn: how far the
 * playhead can safely go (`first`) and how long it would have to wait for the builders to get everything done before it needs it (`deficit`).
 * Costs are the cost model's estimates (ms of build work), rates are measured by `Throughput`, so both are in the same unit.
 */
export class Frontier {
  private readonly pend = new Map<string, { ms: number; cost: number }>();
  private readonly bins = new Map<number, number>();
  private readonly order = new MinHeap<{ ms: number; key: string }>((e) => e.ms);

  get size(): number { return this.pend.size; }

  /** A sprite is wanted from `ms` on and not available yet (calling again for the same key keeps the earlier time). */
  add(key: string, ms: number, cost: number): void {
    const p = this.pend.get(key);
    if (p) { if (ms < p.ms) { this.bump(p.ms, -p.cost); p.ms = ms; this.bump(ms, p.cost); this.order.push({ ms, key }); } return; }
    this.pend.set(key, { ms, cost });
    this.bump(ms, cost);
    this.order.push({ ms, key });
  }

  /** The sprite is available (or will never be: unbuildable). */
  done(key: string): void {
    const p = this.pend.get(key);
    if (!p) return;
    this.pend.delete(key);
    this.bump(p.ms, -p.cost);
  }

  has(key: string): boolean { return this.pend.has(key); }

  private bump(ms: number, cost: number): void {
    const b = Math.floor(ms / BIN);
    const v = (this.bins.get(b) ?? 0) + cost;
    if (v <= 1e-9) this.bins.delete(b); else this.bins.set(b, v);
  }

  /** Earliest time a pending sprite is first drawn (Infinity: nothing is pending). */
  get first(): number {
    for (let e = this.order.peek(); e; e = this.order.peek()) {
      const p = this.pend.get(e.key);
      if (p && p.ms === e.ms) return e.ms;
      this.order.pop();
    }
    return Infinity;
  }

  /**
   * Ms the playhead (at `t`) has to wait so that every pending sprite is built before the frame that draws it, given builders that
   * finish `rate` ms of estimated work per ms of wall time, with `margin` ms of safety per frame. 0 = it can play on as it is.
   */
  deficit(t: number, rate: number, margin: number, horizon = 1500): number {
    if (this.bins.size === 0) return 0;
    const r = Math.max(rate, 1e-3);
    let cum = 0, worst = 0;
    for (const b of [...this.bins.keys()].sort((x, y) => x - y)) {
      if (b * BIN > t + horizon) break;
      cum += this.bins.get(b)!;
      worst = Math.max(worst, cum / r - (b * BIN - t - margin));
    }
    return Math.max(0, worst);
  }

  clear(): void {
    this.pend.clear();
    this.bins.clear();
    this.order.clear();
  }
}
