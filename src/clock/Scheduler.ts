import type { FpsOption } from '../types/options';

/** Receives the presented media time when known (requestVideoFrameCallback), else null. */
export type FrameCallback = (mediaTime: number | null) => void;

type VideoWithVfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export const MIN_FPS = 10;
export const MAX_FPS = 200;

/**
 * Render loop. `'auto'`: one render per presented video frame (requestVideoFrameCallback) when
 * available, otherwise per display frame (requestAnimationFrame). A number caps the rate; it is
 * driven by rAF, so values above the display refresh rate are limited by the display.
 */
export class Scheduler {
  private running = false;
  private rafId = 0;
  private vfcId = 0;
  private last = -Infinity;
  private fps: FpsOption = 'auto';
  private video: VideoWithVfc | null = null;

  constructor(private readonly cb: FrameCallback) {}

  configure(fps: FpsOption, video: HTMLVideoElement | null): void {
    this.fps = fps;
    const wasRunning = this.running;
    this.stop();
    this.video = video;
    if (wasRunning) this.start();
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = -Infinity;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.rafId);
    if (this.vfcId && this.video?.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this.vfcId);
    this.rafId = 0;
    this.vfcId = 0;
  }

  private schedule(): void {
    if (!this.running) return;
    const v = this.video;
    if (this.fps === 'auto' && v && typeof v.requestVideoFrameCallback === 'function') {
      this.vfcId = v.requestVideoFrameCallback((_now, meta) => {
        this.vfcId = 0;
        if (!this.running) return;
        this.cb(meta.mediaTime);
        this.schedule();
      });
      return;
    }
    if (typeof requestAnimationFrame !== 'function') return;
    this.rafId = requestAnimationFrame((now) => {
      this.rafId = 0;
      if (!this.running) return;
      if (this.fps === 'auto') this.cb(null);
      else {
        const interval = 1000 / this.fps;
        const elapsed = now - this.last;
        if (elapsed >= interval - 0.5) {
          // Keep the phase so the average rate matches the target on any refresh rate.
          this.last = elapsed > interval * 4 ? now : now - (elapsed % interval);
          this.cb(null);
        }
      }
      this.schedule();
    });
  }
}
