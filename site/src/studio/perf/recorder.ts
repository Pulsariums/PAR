import type { DiagnosticsEventSinkLike, DiagnosticsLog, DiagnosticsSnapshot, RenderMarker } from '../../../../src/core/Diagnostics';

export interface RecorderReadContext {
  at: number;
  now: number;
  previous: number;
  gap: number;
}

/** One display frame as the recorder saw it. */
export interface FrameSample {
  /** Ms since recording started. */
  at: number;
  /** Ms since the previous display frame. */
  gap: number;
  /** Optional frame timings; line attribution comes only from the event logger. */
  diagnostics?: DiagnosticsSnapshot;
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
  /** The selected frame budget, when the recorder knows the video/render fps. */
  budgetMs?: number;
  /** Renderer elapsed time proxy from its rolling frame window. */
  renderMs?: number;
  /** Runtime counters sampled with the frame; cumulative counters stay cumulative. */
  render?: RenderSample;
  source?: SourceSample;
  /** Source arrival work since the previous recorder sample. */
  windowApplyMs?: number;
  windowPrepareMs?: number;
}

/** A bounded, text-free record of an actual render submission. */
export interface LoggerLineRecord extends RenderMarker {
  at: number;
  media: number;
}

export interface EventLoggerSource {
  setEventLogger(sink: DiagnosticsEventSinkLike | null): void;
  getEventLog(): DiagnosticsLog;
}

/** Metadata supplied by requestVideoFrameCallback when the adapter exposes it. */
export interface VideoFrameRecord {
  at: number;
  media: number;
  presentedFrames?: number;
  expectedDisplayTime?: number;
  processingDuration?: number;
}

export interface VideoFrameSource {
  requestVideoFrameCallback?: (callback: (now: number, metadata: { mediaTime: number; presentedFrames?: number; expectedDisplayTime?: number; processingDuration?: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
}

export interface RenderSample {
  domLines: number;
  canvasLines: number;
  spriteHits: number;
  spriteMisses: number;
  workers: number;
  workerBuilt: number;
  planQueued: number;
  planLeadMs: number;
  pending: number;
  readyMs: number;
  deficitMs: number;
  buildRate: number;
  missing: number;
  missedTotal: number;
  held: number;
  compositeMs: number;
  stalls: number;
  stallMs: number;
  evictions: number;
}

export interface SourceSample {
  windowEvents: number;
  loading: boolean;
  bytesRead: number;
  decodeMs: number;
  indexMs: number;
  windowApplyTotalMs?: number;
  windowPrepareTotalMs?: number;
}

export interface LongTaskAttribution { name: string; containerType: string }
export interface LongTask { at: number; dur: number; attribution?: LongTaskAttribution[]; attributionDropped?: number }

export const MAX_LONG_TASKS = 2000;
export const MAX_TASK_ATTRIBUTIONS = 4;
// Only browser-defined categories are retained. Container names/ids/src can contain private page data.
const TASK_NAMES = new Set(['unknown', 'self', 'same-origin', 'same-origin-ancestor', 'same-origin-descendant', 'cross-origin-ancestor', 'cross-origin-descendant', 'cross-origin-unreachable', 'multiple-contexts']);
const CONTAINER_TYPES = new Set(['window', 'iframe', 'embed', 'object']);
export const taskAttribution = (value: unknown): LongTaskAttribution[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, MAX_TASK_ATTRIBUTIONS).map((entry: unknown) => {
    const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    return {
      name: typeof item.name === 'string' && TASK_NAMES.has(item.name) ? item.name : 'unknown',
      containerType: typeof item.containerType === 'string' && CONTAINER_TYPES.has(item.containerType) ? item.containerType : 'unknown',
    };
  });
};

/** What a run collected, before it is turned into a report. */
export interface RawRun {
  frames: FrameSample[];
  longTasks: LongTask[];
  longTasksDropped?: number;
  longTaskAttributionAvailable?: boolean;
  /** Ms the recording lasted. */
  durationMs: number;
  startMedia: number;
  endMedia: number;
  /** Whether the transport was playing for the whole run. */
  playing: boolean;
  seeks: number;
  heapStartMB: number | null;
  heapEndMB: number | null;
  /** Bounded diagnostic attribution; absent on runs collected by older callers. */
  lineEvents?: LoggerLineRecord[];
  /** Cumulative records rejected by the recorder or renderer across all segments of the run. */
  lineEventsDropped?: number;
  /** Optional video presentation metadata from requestVideoFrameCallback. */
  videoFrames?: VideoFrameRecord[];
}

/** Longest recording kept (frames are stored one by one). */
export const MAX_RUN_MS = 10 * 60 * 1000;
export const MAX_LINE_EVENTS = 2000;
export const MAX_VIDEO_FRAMES = 36000;

/**
 * Collects frames on the display's own clock. `sample` reads the renderer; `now` is injected so a run can be replayed in tests.
 * Recording is opt-in: it calls `getMetrics()` once per frame, which is why the watch view never does.
 */
export class Recorder {
  private frames: FrameSample[] = [];
  private longTasks: LongTask[] = [];
  private longTasksDropped = 0;
  private attributionAvailable = false;
  private t0 = 0;
  private last = 0;
  private windowApplyTotalMs = 0;
  private windowPrepareTotalMs = 0;
  private startMedia = NaN;
  private lastMedia = NaN;
  private everPaused = false;
  private seeks = 0;
  private heap0: number | null = null;
  private heap1: number | null = null;
  private lineEvents: LoggerLineRecord[] = [];
  private lineEventsDropped = 0;
  private readonly eventSink: DiagnosticsEventSinkLike = (marker) => {
    if (!this.active) return;
    if (this.lineEvents.length >= MAX_LINE_EVENTS) { this.lineEventsDropped++; return; }
    const { sessionId, id, index, mediaTime, generation, epoch, path, start, end, outcome } = marker;
    this.lineEvents.push({ at: Math.max(0, Math.round(start - this.t0)), media: mediaTime, sessionId, id, index, mediaTime, generation, epoch, path, start, end, outcome });
  };
  private videoFrames: VideoFrameRecord[] = [];
  private videoId: number | null = null;
  private videoGeneration = 0;
  private obs: PerformanceObserver | null = null;
  private observedLongTasks = false;
  private id: number | null = null;
  active = false;

  constructor(
    private readonly read: (context: RecorderReadContext) => Omit<FrameSample, 'at' | 'gap'> & { playing: boolean; heapMB: number | null },
    private readonly video: VideoFrameSource | null = null,
    private readonly eventLogger: EventLoggerSource | null = null,
  ) {}

  start(now = performance.now()): void {
    if (this.active) return;
    this.obs?.disconnect();
    this.obs = null;
    this.frames = [];
    this.observedLongTasks = false;
    this.longTasks = [];
    this.longTasksDropped = 0;
    this.attributionAvailable = false;
    this.t0 = now;
    this.last = 0;
    this.windowApplyTotalMs = 0;
    this.windowPrepareTotalMs = 0;
    this.startMedia = NaN;
    this.lastMedia = NaN;
    this.everPaused = false;
    this.seeks = 0;
    this.heap0 = null;
    this.heap1 = null;
    this.lineEvents = [];
    this.lineEventsDropped = 0;
    this.videoFrames = [];
    this.videoId = null;
    this.videoGeneration++;
    this.active = true;
    this.eventLogger?.setEventLogger(this.eventSink);
    const generation = this.videoGeneration;
    try {
      this.obs = new PerformanceObserver((list) => {
        if (!this.active || generation !== this.videoGeneration) return;
        this.recordLongTasks(list.getEntries());
      });
      this.obs.observe({ entryTypes: ['longtask'] });
      this.observedLongTasks = true;
    } catch { this.obs = null; /* longtask is Chromium only: the report says "not measured" */ }
    this.scheduleVideoFrame();
    this.scheduleFrame();
  }

  private recordLongTasks(entries: readonly PerformanceEntry[]): void {
    for (const e of entries) {
      const at = Math.round(e.startTime - this.t0), dur = Math.round(e.duration);
      if (!Number.isFinite(at) || !Number.isFinite(dur) || dur <= 0 || at + dur < 0 || at > MAX_RUN_MS) continue;
      if (this.longTasks.length >= MAX_LONG_TASKS) { this.longTasksDropped++; continue; }
      const value = (e as PerformanceEntry & { attribution?: unknown }).attribution;
      const attribution = taskAttribution(value);
      if (attribution?.length) this.attributionAvailable = true;
      this.longTasks.push({ at: Math.max(0, at), dur,
        ...(attribution ? { attribution, attributionDropped: Math.max(0, (value as unknown[]).length - attribution.length) } : {}),
      });
    }
  }

  private scheduleFrame(): void {
    const generation = this.videoGeneration;
    this.id = requestAnimationFrame((t) => {
      if (!this.active || generation !== this.videoGeneration) return;
      this.tick(t);
    });
  }

  private scheduleVideoFrame(): void {
    const request = this.video?.requestVideoFrameCallback;
    if (!request) return;
    const generation = this.videoGeneration;
    this.videoId = request.call(this.video, (now, metadata) => {
      if (!this.active || generation !== this.videoGeneration) return;
      this.videoId = null;
      if (this.videoFrames.length < MAX_VIDEO_FRAMES && Number.isFinite(metadata.mediaTime)) {
        this.videoFrames.push({
          at: Math.max(0, Math.round(now - this.t0)), media: metadata.mediaTime,
          ...(metadata.presentedFrames === undefined ? {} : { presentedFrames: metadata.presentedFrames }),
          ...(metadata.expectedDisplayTime === undefined ? {} : { expectedDisplayTime: metadata.expectedDisplayTime }),
          ...(metadata.processingDuration === undefined ? {} : { processingDuration: metadata.processingDuration }),
        });
      }
      this.scheduleVideoFrame();
    });
  }

  private tick(now: number): void {
    this.id = null;
    if (!this.active) return;
    this.add(now);
    if (now - this.t0 >= MAX_RUN_MS) { this.stop(now); return; }
    this.scheduleFrame();
  }

  /** Records one frame (public for tests; `tick` calls it with the rAF timestamp). */
  add(now: number): void {
    const at = Math.round(now - this.t0);
    const gap = this.last > 0 ? Math.round((now - this.last) * 10) / 10 : 0;
    const r = this.read({ at, now, previous: this.last, gap });
    if (this.last > 0 && Number.isFinite(this.lastMedia) && Math.abs(r.media - this.lastMedia) > 2) this.seeks++;
    if (!r.playing) this.everPaused = true;
    if (this.heap0 === null) this.heap0 = r.heapMB;
    if (Number.isNaN(this.startMedia)) this.startMedia = r.media;
    this.lastMedia = r.media;
    const { playing: _p, heapMB: _h, ...rest } = r;
    // The first frame has no previous one: its gap is not a measurement.
    const apply = r.source?.windowApplyTotalMs ?? r.diagnostics?.windowApplyTotalMs;
    const prepare = r.source?.windowPrepareTotalMs ?? r.diagnostics?.windowPrepareTotalMs;
    const windowApplyMs = apply === undefined ? undefined : Math.max(0, apply - this.windowApplyTotalMs);
    const windowPrepareMs = prepare === undefined ? undefined : Math.max(0, prepare - this.windowPrepareTotalMs);
    if (this.last > 0 && this.frames.length < MAX_VIDEO_FRAMES) this.frames.push({ ...rest, at, gap, windowApplyMs, windowPrepareMs });
    // Preserve opening arrival work until the first retained frame (the initial rAF has no gap).
    if (this.last > 0) {
      this.windowApplyTotalMs = apply ?? this.windowApplyTotalMs;
      this.windowPrepareTotalMs = prepare ?? this.windowPrepareTotalMs;
    }
    this.last = now;
    this.heap1 = r.heapMB;
  }

  /** Stops and returns what was collected. */
  stop(now = performance.now()): RawRun {
    if (this.active && this.obs?.takeRecords) this.recordLongTasks(this.obs.takeRecords());
    if (this.active && this.eventLogger) {
      // The sink captured markers across segments; the snapshot supplies truncation, not a second copy.
      this.lineEventsDropped += this.eventLogger.getEventLog().dropped;
      this.eventLogger.setEventLogger(null);
    }
    this.active = false;
    if (this.id !== null) cancelAnimationFrame(this.id);
    this.id = null;
    if (this.videoId !== null && this.video?.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this.videoId);
    this.videoId = null;
    this.videoGeneration++;
    this.obs?.disconnect();
    this.obs = null;
    return {
      frames: this.frames, longTasks: this.longTasks, longTasksDropped: this.longTasksDropped, longTaskAttributionAvailable: this.attributionAvailable, durationMs: Math.round(now - this.t0), startMedia: this.startMedia, endMedia: this.lastMedia,
      playing: !this.everPaused, seeks: this.seeks, heapStartMB: this.heap0, heapEndMB: this.heap1, lineEvents: this.lineEvents, lineEventsDropped: this.lineEventsDropped, videoFrames: this.videoFrames,
    };
  }

  /** Releases retained recording data and clears the renderer's bounded log. */
  clear(): void {
    this.stop();
    this.eventLogger?.setEventLogger(null);
    this.frames = [];
    this.longTasks = [];
    this.longTasksDropped = 0;
    this.attributionAvailable = false;
    this.lineEvents = [];
    this.lineEventsDropped = 0;
    this.videoFrames = [];
  }

  /** Whether the browser reports long tasks at all. */
  get longTasksSupported(): boolean { return this.observedLongTasks; }
}
