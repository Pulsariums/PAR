/** Window (ms of wall time) one throughput sample is taken over. */
const WINDOW = 250;
const EMA = 0.35;

/**
 * Sprite-building throughput of this machine as it really is: estimated build work (ms, from the cost model) finished per ms of wall
 * time while there was work to do. It includes everything that limits the pipeline (workers, cores, the page thread's own load), so
 * the figure is what a deadline can be checked against. Idle stretches are not counted.
 */
export class Throughput {
  private rate = 0;
  private acc = 0;
  private from = -1;

  constructor(public guess: number, private readonly now: () => number = () => performance.now()) {}

  /** What to assume until something was measured (`guess`), then the smoothed measurement. */
  get value(): number { return this.rate > 0 ? this.rate : this.guess; }

  get measured(): boolean { return this.rate > 0; }

  /** Work was handed to the builders while they were idle: the clock for a sample starts. */
  busy(): void { if (this.from < 0) this.from = this.now(); }

  /** `cost` ms of estimated work finished. */
  done(cost: number): void {
    if (this.from < 0) return;
    this.acc += cost;
    const t = this.now();
    if (t - this.from < WINDOW) return;
    const sample = this.acc / (t - this.from);
    this.rate = this.rate > 0 ? this.rate * (1 - EMA) + sample * EMA : sample;
    this.acc = 0;
    this.from = t;
  }

  /** Nothing is pending any more: the next work starts a new sample. */
  idle(): void { this.from = -1; this.acc = 0; }
}
