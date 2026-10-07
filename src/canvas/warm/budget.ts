/** Longest slice of spare time ever taken between two frames (ms), and the shortest. */
export const MAX_SLICE_MS = 8;
export const MIN_SLICE_MS = 1.5;
/** Slice when nothing is being drawn (paused, between bursts): the main thread is free. */
export const IDLE_SLICE_MS = 12;
/** Share of the room a frame leaves (its interval minus its own cost) that one slice may take. */
const SHARE = 0.45;
const EMA = 0.2;

/**
 * How long a look-ahead slice may run, learned from this machine: the cost of the frames just drawn, the interval between them,
 * whether display frames came late (`LoadMeter`) and how long a build takes. A slow CPU has big frames and little room, so its slices
 * shrink by themselves; a fast one with cheap frames gets longer slices and finishes a burst's builds sooner.
 */
export class SliceBudget {
  private frame = 0;
  private gap = 0;
  /** Smoothed wall ms of one planned-and-built sprite on this machine. */
  perBuild = 0;

  noteFrame(costMs: number, gapMs: number | null): void {
    this.frame = this.frame === 0 ? costMs : this.frame * (1 - EMA) + costMs * EMA;
    if (gapMs !== null && gapMs > 0 && gapMs < 500) this.gap = this.gap === 0 ? gapMs : this.gap * (1 - EMA) + gapMs * EMA;
  }

  noteBuilds(n: number, ms: number): void {
    if (n <= 0) return;
    const per = ms / n;
    this.perBuild = this.perBuild === 0 ? per : this.perBuild * (1 - EMA) + per * EMA;
  }

  get frameCost(): number { return this.frame; }

  /** `playing`: frames were drawn lately. `late`: share of recent display frames that came late (null = unknown / not playing). */
  slice(playing: boolean, late: number | null): number {
    if (!playing) return IDLE_SLICE_MS;
    const room = Math.max(0, (this.gap || 16.7) - this.frame);
    const s = Math.max(MIN_SLICE_MS, Math.min(MAX_SLICE_MS, room * SHARE));
    return late !== null && late >= 0.2 ? Math.min(s, 2) : s;
  }
}
