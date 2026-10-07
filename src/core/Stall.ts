/** A hold shorter than this deficit (ms) is not worth pausing the video for. */
const MIN_DEFICIT_MS = 25;
/** Longest single hold (ms): past it playback goes on and frames are drawn with what exists (a pipeline that cannot catch up must not freeze the video). */
const MAX_HOLD_MS = 3000;
/** After a hold, no new one for this long (ms) unless the deficit is large again: a pessimistic estimate must not turn into a stutter of its own. */
const COOLDOWN_MS = 400;
const POLL_MS = 30;

interface Clip { paused: boolean; seeking: boolean; ended: boolean; pause(): void; play(): Promise<void> | void }

/**
 * Buffering for subtitle sprites: when the look-ahead computes that playing on would reach a frame whose sprites are not built yet
 * (`probe()` > 0: the wait the builders still need), the video is paused for exactly that long, like a streaming player that
 * rebuffers, and resumed once nothing would be late. Only a clip this class paused is resumed, and only while nobody touched it.
 * Never while hidden, seeking or already paused: a paused / seeking video is handled by holding the subtitle frame instead.
 */
export class Stall {
  private on = false;
  private since = 0;
  private cool = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private resuming = false;
  stalls = 0;
  stallMs = 0;

  constructor(private readonly clip: () => Clip | null, private readonly probe: () => number) {}

  get active(): boolean { return this.on; }

  /** Called per drawn frame while playing with the current deficit (ms). */
  consider(deficit: number): void {
    const v = this.clip();
    const now = performance.now();
    if (this.on || !v || v.paused || v.seeking || v.ended || (typeof document !== 'undefined' && document.hidden)) return;
    if (deficit < MIN_DEFICIT_MS || (now < this.cool && deficit < 250)) return;
    this.on = true;
    this.since = now;
    this.stalls++;
    v.pause();
    this.poll();
  }

  /** The viewer pressed play while held (a `play` event we did not cause): their wish wins. */
  userPlayed(): void {
    if (this.on && !this.resuming) this.finish(false);
  }

  private poll(): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.on) return;
      if (this.probe() <= 0 || performance.now() - this.since > MAX_HOLD_MS) this.finish(true);
      else this.poll();
    }, POLL_MS);
  }

  private finish(resume: boolean): void {
    const v = this.clip();
    this.on = false;
    this.stallMs += performance.now() - this.since;
    this.cool = performance.now() + COOLDOWN_MS;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (resume && v && v.paused && !v.seeking) {
      this.resuming = true;
      try { void Promise.resolve(v.play()).catch(() => undefined).finally(() => { this.resuming = false; }); } catch { this.resuming = false; }
    }
  }

  dispose(): void { if (this.on) this.finish(true); }
}
