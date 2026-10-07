/** One display frame as the recorder saw it. */
export interface FrameSample {
  /** Ms since recording started. */
  at: number;
  /** Ms since the previous display frame. */
  gap: number;
  /** Subtitle time (s) the renderer showed. */
  media: number;
  lines: number;
  drawn: number;
  fillMpx: number;
  shed: number;
  /** Cumulative counters of the renderer (the report works with differences). */
  misses: number;
  skipped: number;
  dropped: number;
  /** Draw call time p50 / p95 (ms) of the renderer's own rolling window. */
  drawP50: number;
  drawP95: number;
}

export interface LongTask { at: number; dur: number }

/** What a run collected, before it is turned into a report. */
export interface RawRun {
  frames: FrameSample[];
  longTasks: LongTask[];
  /** Ms the recording lasted. */
  durationMs: number;
  startMedia: number;
  endMedia: number;
  /** Whether the transport was playing for the whole run. */
  playing: boolean;
  seeks: number;
  heapStartMB: number | null;
  heapEndMB: number | null;
}

/** Longest recording kept (frames are stored one by one). */
export const MAX_RUN_MS = 10 * 60 * 1000;

/**
 * Collects frames on the display's own clock. `sample` reads the renderer; `now` is injected so a run can be replayed in tests.
 * Recording is opt-in: it calls `getMetrics()` once per frame, which is why the watch view never does.
 */
export class Recorder {
  private frames: FrameSample[] = [];
  private longTasks: LongTask[] = [];
  private t0 = 0;
  private last = 0;
  private startMedia = NaN;
  private lastMedia = NaN;
  private everPaused = false;
  private seeks = 0;
  private heap0: number | null = null;
  private heap1: number | null = null;
  private obs: PerformanceObserver | null = null;
  private id = 0;
  active = false;

  constructor(private readonly read: () => Omit<FrameSample, 'at' | 'gap'> & { playing: boolean; heapMB: number | null }) {}

  start(now = performance.now()): void {
    this.frames = [];
    this.longTasks = [];
    this.t0 = now;
    this.last = 0;
    this.startMedia = NaN;
    this.lastMedia = NaN;
    this.everPaused = false;
    this.seeks = 0;
    this.heap0 = null;
    this.active = true;
    try {
      this.obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) this.longTasks.push({ at: Math.round(e.startTime - this.t0), dur: Math.round(e.duration) });
      });
      this.obs.observe({ entryTypes: ['longtask'] });
    } catch { this.obs = null; /* longtask is Chromium only: the report says "not measured" */ }
    this.id = requestAnimationFrame((t) => this.tick(t));
  }

  private tick(now: number): void {
    this.id = 0;
    if (!this.active) return;
    this.add(now);
    if (now - this.t0 >= MAX_RUN_MS) { this.active = false; return; }
    this.id = requestAnimationFrame((t) => this.tick(t));
  }

  /** Records one frame (public for tests; `tick` calls it with the rAF timestamp). */
  add(now: number): void {
    const r = this.read();
    if (this.last > 0 && Number.isFinite(this.lastMedia) && Math.abs(r.media - this.lastMedia) > 2) this.seeks++;
    if (!r.playing) this.everPaused = true;
    if (this.heap0 === null) this.heap0 = r.heapMB;
    if (Number.isNaN(this.startMedia)) this.startMedia = r.media;
    this.lastMedia = r.media;
    const { playing: _p, heapMB: _h, ...rest } = r;
    // The first frame has no previous one: its gap is not a measurement.
    if (this.last > 0) this.frames.push({ ...rest, at: Math.round(now - this.t0), gap: Math.round((now - this.last) * 10) / 10 });
    this.last = now;
    this.heap1 = r.heapMB;
  }

  /** Stops and returns what was collected. */
  stop(now = performance.now()): RawRun {
    this.active = false;
    if (this.id) cancelAnimationFrame(this.id);
    this.id = 0;
    this.obs?.disconnect();
    return {
      frames: this.frames, longTasks: this.longTasks, durationMs: Math.round(now - this.t0), startMedia: this.startMedia, endMedia: this.lastMedia,
      playing: !this.everPaused, seeks: this.seeks, heapStartMB: this.heap0, heapEndMB: this.heap1,
    };
  }

  /** Whether the browser reports long tasks at all. */
  get longTasksSupported(): boolean { return this.obs !== null; }
}
