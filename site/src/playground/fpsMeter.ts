/** The text of a measured rate: a number while playing, an em dash when nothing is being measured (paused, idle). */
export const fpsText = (fps: number | null): string => (fps === null ? '—' : String(fps));

/**
 * Measured render rate: counts distinct subtitle times drawn per second. It only measures while the clock is running:
 * paused or idle there is no rate to measure, so `fps` is null (shown as an em dash) instead of a misleading 0.
 */
export class FpsMeter {
  fps: number | null = null;
  private last = NaN;
  private frames = 0;
  private since = 0;
  private wasPlaying = false;

  /** Call every animation frame. Returns true once per half second, when the readout should be refreshed. */
  sample(time: number, playing: boolean, now: number = performance.now()): boolean {
    if (!playing) {
      this.wasPlaying = false;
      this.frames = 0;
      this.last = NaN;
      this.fps = null;
      if (now - this.since < 500) return false;
      this.since = now;
      return true;
    }
    if (!this.wasPlaying) { this.wasPlaying = true; this.frames = 0; this.last = time; this.since = now; return true; }
    if (time !== this.last) { this.frames++; this.last = time; }
    if (now - this.since < 500) return false;
    this.fps = Math.round((this.frames * 1000) / (now - this.since));
    this.frames = 0;
    this.since = now;
    return true;
  }
}
