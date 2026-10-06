/** Rolling frame times (ms) of the last `size` drawn frames: what `getMetrics().render.frameMs` reports. */
export class FrameStats {
  private readonly buf: number[] = [];
  private pos = 0;

  constructor(private readonly size = 120) {}

  /** Runs `fn` and records how long it took. */
  time(fn: () => void): void {
    const t0 = performance.now();
    fn();
    this.record(performance.now() - t0);
  }

  record(ms: number): void {
    if (this.buf.length < this.size) this.buf.push(ms);
    else this.buf[this.pos] = ms;
    this.pos = (this.pos + 1) % this.size;
  }

  /** Nearest-rank percentile of the window (0 when empty). */
  percentile(p: number): number {
    if (this.buf.length === 0) return 0;
    const a = this.buf.slice().sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor(a.length * p))];
  }

  snapshot(): { p50: number; p95: number; samples: number } {
    const r = (n: number): number => Math.round(n * 100) / 100;
    return { p50: r(this.percentile(0.5)), p95: r(this.percentile(0.95)), samples: this.buf.length };
  }

  clear(): void {
    this.buf.length = 0;
    this.pos = 0;
  }
}
