import type { PreparedLine } from '../anim/Prepared';
import type { CanvasProfile } from '../canvas/types';

export type DiagnosticsPath = 'dom' | 'canvas';

export type DiagnosticsOutcome = 'rendered' | 'missing' | 'held' | 'shed' | 'skipped' | 'unavailable';

/** A bounded marker for one event's actual render submission. It never contains subtitle text. */
export interface RenderMarker {
  sessionId: number;
  id: string;
  index: number;
  mediaTime: number;
  generation: number;
  epoch: number;
  path: DiagnosticsPath;
  start: number;
  end: number;
  outcome: DiagnosticsOutcome;
}

export interface DiagnosticsCandidate {
  id: string;
  index: number;
  start: number;
  end: number;
  path: DiagnosticsPath;
  style: string;
}

export interface DiagnosticsVideoFrame {
  now: number;
  mediaTime: number;
  expectedDisplayTime?: number;
  presentationTime?: number;
  presentedFrames?: number;
  processingDuration?: number;
}

export interface DiagnosticsEventSink {
  record(marker: RenderMarker): void;
}

export type DiagnosticsEventSinkLike = DiagnosticsEventSink | ((marker: RenderMarker) => void);

export interface DiagnosticsLog {
  sessionId: number;
  /** Bounded markers from the current renderer/source segment. */
  markers: RenderMarker[];
  /** Cumulative rejections since the sink was installed or the log was cleared. */
  dropped: number;
}

const MAX_MARKERS = 300;
const MAX_MARKERS_PER_FRAME = 64;

/** Opt-in, bounded event marker logger. No work is done until a sink is installed. */
export class RenderLogger {
  private sink: DiagnosticsEventSinkLike | null = null;
  private session = 0;
  private markers: RenderMarker[] = [];
  private droppedCount = 0;
  private frameEpoch = -1;
  private frameCount = 0;

  setSink(sink: DiagnosticsEventSinkLike | null): void {
    this.sink = sink;
    this.reset();
  }

  get enabled(): boolean { return this.sink !== null; }

  /** Invalidates segment markers without erasing the logging run's drop count. */
  segment(): void {
    if (!this.sink) return;
    this.session++;
    this.markers.length = 0;
    this.frameEpoch = -1;
    this.frameCount = 0;
  }

  clear(): void {
    this.reset();
  }

  private reset(): void {
    this.session++;
    this.markers.length = 0;
    this.droppedCount = 0;
    this.frameEpoch = -1;
    this.frameCount = 0;
  }

  mark(marker: Omit<RenderMarker, 'sessionId'>): void {
    const sink = this.sink;
    if (!sink) return;
    if (this.frameEpoch !== marker.epoch) {
      this.frameEpoch = marker.epoch;
      this.frameCount = 0;
    }
    if (this.frameCount >= MAX_MARKERS_PER_FRAME || this.markers.length >= MAX_MARKERS) {
      this.droppedCount++;
      return;
    }
    this.frameCount++;
    const out: RenderMarker = { sessionId: this.session, ...marker };
    this.markers.push(out);
    if (typeof sink === 'function') sink(out);
    else sink.record(out);
  }

  snapshot(): DiagnosticsLog {
    return { sessionId: this.session, markers: this.markers.slice(), dropped: this.droppedCount };
  }
}

export interface DiagnosticsPrepare {
  /** Synchronous draw work before Scene.render; absent in older snapshots. */
  prepareMs?: number;
  relayoutMs?: number;
  sourceUpdateMs?: number;
  sourceReady?: boolean;
  sourceLoading?: boolean;
  windowRange?: [number, number] | null;
  /** Cumulative source-arrival work, outside draw/Scene.render. */
  windowApplyTotalMs?: number;
  windowPrepareTotalMs?: number;
  prepareStartedAt?: number;
  completedAt?: number;
  sceneRendered?: boolean;
  /** Completed nonempty DOM/canvas surface submission, not physical display. */
  rendererSubmitted?: boolean;
  skipReason?: 'unchanged' | 'fonts-blocked';
}

export interface DiagnosticsSnapshot extends DiagnosticsPrepare {
  serial: number;
  observedAt: number;
  media: number;
  presented: boolean;
  held: boolean;
  sceneMs: number;
  renderMs: number;
  domMs: number | null;
  canvasMs: number | null;
  eventCount: number;
  /** Capability-detected requestVideoFrameCallback data, omitted for rAF/manual renders. */
  videoFrame?: DiagnosticsVideoFrame;
  /** Opt-in canvas composition counters; omitted when the canvas path was not used. */
  canvas?: CanvasProfile;
  candidates?: DiagnosticsCandidate[];
}

export interface SceneDiagnosticsSample {
  sceneMs: number;
  domMs: number | null;
  canvasMs: number | null;
  visible: readonly PreparedLine[];
  route: readonly boolean[];
  canvas: CanvasProfile | null;
}

interface DiagnosticsFrame extends SceneDiagnosticsSample, DiagnosticsPrepare {
  media: number;
  presented: boolean;
  held: boolean;
  renderMs: number;
  videoFrame?: DiagnosticsVideoFrame;
}

/** Opt-in, frame-level render diagnostics. Candidate objects are built only by snapshot(true). */
export class Diagnostics {
  private enabled = false;
  private serial = 0;
  private latest: DiagnosticsFrame | null = null;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  get active(): boolean { return this.enabled; }

  record(frame: DiagnosticsFrame): void {
    if (!this.enabled) return;
    this.latest = frame;
    this.serial++;
  }

  clear(): void {
    this.latest = null;
    this.serial = 0;
  }

  snapshot(includeEvents = false): DiagnosticsSnapshot | null {
    if (!this.enabled || !this.latest) return null;
    const frame = this.latest;
    const out: DiagnosticsSnapshot = {
      serial: this.serial,
      observedAt: performance.now(),
      media: frame.media,
      presented: frame.presented,
      held: frame.held,
      sceneMs: frame.sceneMs,
      renderMs: frame.renderMs,
      prepareMs: frame.prepareMs,
      relayoutMs: frame.relayoutMs,
      sourceUpdateMs: frame.sourceUpdateMs,
      sourceReady: frame.sourceReady,
      sourceLoading: frame.sourceLoading,
      windowRange: frame.windowRange ? [...frame.windowRange] : frame.windowRange,
      windowApplyTotalMs: frame.windowApplyTotalMs,
      windowPrepareTotalMs: frame.windowPrepareTotalMs,
      prepareStartedAt: frame.prepareStartedAt,
      completedAt: frame.completedAt,
      sceneRendered: frame.sceneRendered,
      rendererSubmitted: frame.rendererSubmitted,
      skipReason: frame.skipReason,
      domMs: frame.domMs,
      canvasMs: frame.canvasMs,
      eventCount: frame.visible.length,
    };
    if (frame.videoFrame) out.videoFrame = { ...frame.videoFrame };
    if (frame.canvas) out.canvas = { ...frame.canvas };
    if (includeEvents) {
      const candidates: DiagnosticsCandidate[] = [];
      const limit = Math.min(20, frame.visible.length);
      for (let i = 0; i < limit; i++) {
        const event = frame.visible[i].event;
        candidates.push({
          id: event.id,
          index: event.index,
          start: event.start,
          end: event.end,
          path: frame.route[i] ? 'canvas' : 'dom',
          style: event.style,
        });
      }
      out.candidates = candidates;
    }
    return out;
  }
}
