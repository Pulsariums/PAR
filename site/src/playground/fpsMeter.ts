/** Measured render rate: counts distinct subtitle times drawn per second (call `sample(time)` every animation frame). */
export class FpsMeter {
  fps = 0;
  private last = NaN;
  private frames = 0;
  private since = performance.now();

  /** Returns true once per half second, when `fps` was refreshed. */
  sample(time: number): boolean {
    if (time !== this.last) { this.frames++; this.last = time; }
    const now = performance.now();
    if (now - this.since < 500) return false;
    this.fps = Math.round((this.frames * 1000) / (now - this.since));
    this.frames = 0;
    this.since = now;
    return true;
  }
}
