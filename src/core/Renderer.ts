import { Scheduler } from '../clock/Scheduler';
import { bindVideoEvents, isPlaying } from '../clock/videoEvents';
import { preflightScript } from '../preflight/preflight';
import type { LineEnv } from '../render/LineView';
import { Overlay } from '../render/Overlay';
import type { SubtitleSource } from '../source/types';
import type { PARMetrics, PAROptions, ResolvedOptions } from '../types/options';
import type { ParsedScript } from '../types/script';

import { FontApi } from './FontApi';
import { FrameStats } from './FrameStats';
import { LoadMeter } from './LoadMeter';
import { Stall } from './Stall';
import { observeSize } from './observe';
import { computeStage, deviceScale } from './stage';
import { resolveOptions } from './options';
import { buildMetrics, renderMetrics, type Geometry } from './metrics';
import { debugWorkers } from '../canvas/workers/size';
import { Scene } from './Scene';
import { ScriptHost } from './ScriptHost';
import { timeToMs } from './time';
import type { SourceStatsReport } from './WindowFeed';
import { Diagnostics, RenderLogger, type DiagnosticsEventSinkLike, type DiagnosticsLog, type DiagnosticsSnapshot } from './Diagnostics';
import type { VideoFrameMetadata } from '../clock/Scheduler';

/** The PAR renderer instance. Create it with `PAR.create(options)` or `new PARRenderer(options)`. */
export class PARRenderer extends FontApi {
  /** Font check without an instance or a DOM: `PARRenderer.preflightScript(text, options)`. */
  static readonly preflightScript = preflightScript;
  private opts: ResolvedOptions;
  private overlay!: Overlay;
  private scene!: Scene;
  private readonly host: ScriptHost;
  private readonly scheduler: Scheduler;
  /** Undo functions of everything `mount()` attached (size observer, video listeners). */
  private teardown: Array<() => void> = [];
  private env: LineEnv = { layout: { width: 1280, height: 720 }, styles: new Map(), borderScale: 1, fonts: this.fonts };
  private geo: Geometry = { region: { x: 0, y: 0, width: 0, height: 0 }, scale: { x: 0, y: 0 }, layout: { size: { width: 1280, height: 720 }, source: 'default', derived: false } };
  private layoutDirty = true;
  private forceNext = true;
  private lastMs = NaN;
  private lastRaw = 0;
  private renderGeneration = 0;
  private destroyed = false;
  private readonly frames = new FrameStats();
  private readonly diagnostics = new Diagnostics();
  private readonly logger = new RenderLogger();
  private lastVideoFrame: VideoFrameMetadata | undefined;
  private readonly load = new LoadMeter();
  private readonly stall = new Stall(() => this.opts.video, () => this.scene.deficit(this.lastMs));
  private seekBufferUntilMs = 0;
  constructor(options: PAROptions) {
    super();
    this.opts = resolveOptions(options);
    this.scheduler = new Scheduler((mediaTime, metadata) => {
      this.lastVideoFrame = metadata;
      this.frame(mediaTime);
    });
    this.host = new ScriptHost({
      scene: () => this.scene, fonts: this.fonts, windowSeconds: () => this.opts.windowSeconds, reset: () => this.resetMissing(),
      changed: () => { this.diagnostics.clear(); this.logger.segment(); this.env = { ...this.env, styles: this.host.styles }; this.forceNext = true; this.draw(this.now(), false); },
      error: (e) => console.warn('PAR: subtitle source error', e),
    });
    this.mount();
    this.configureFonts(this.opts);
    if (options.fonts) void this.fonts.addMany(options.fonts);
    if (options.subtitle !== undefined) this.setSubtitle(options.subtitle);
  }

  /** Parsed script (read-only view), or null when none is loaded. */
  get script(): ParsedScript | null { return this.host.script; }

  /** The overlay root element (inside the container). */
  get element(): HTMLElement { return this.overlay.root; }

  /**
   * Loads (or with null/'' clears) the subtitle: ASS text (parsed whole), or a `SubtitleSource` (only a sliding window of
   * events is held in memory, see `fromAssFile`). Never throws on malformed scripts.
   */
  setSubtitle(input: string | SubtitleSource | null): void {
    this.assertAlive();
    this.logger.segment();
    this.host.load(input || null);
    this.env = { ...this.env, styles: this.host.styles };
    this.invalidate();
    this.diagnostics.clear();
  }

  /** Window / source numbers: events in memory, loaded range, whether a read is running, bytes read and decode time. */
  getSourceStats(): SourceStatsReport {
    return this.host.stats();
  }

  /** Enables or disables opt-in frame timing and visible-event attribution. */
  setDiagnostics(enabled: boolean): void {
    this.assertAlive();
    this.diagnostics.setEnabled(enabled);
    this.host.setDiagnostics(enabled);
    this.scene.setDiagnostics(enabled);
    if (enabled) this.forceNext = true;
  }

  /** Returns the latest diagnostic frame, optionally materializing up to 20 visible-event candidates. */
  getDiagnostics(includeEvents = false): DiagnosticsSnapshot | null {
    return this.diagnostics.snapshot(includeEvents);
  }

  /** Installs the opt-in bounded event sink. Null disables it with no per-line logging work. */
  setEventLogger(sink: DiagnosticsEventSinkLike | null): void {
    this.assertAlive();
    this.logger.setSink(sink);
    this.scene.setLogger(this.logger.enabled ? this.logger : null);
    this.scheduler.setMetadataCapture(this.logger.enabled);
  }

  /** Returns current-segment markers and cumulative drops since the event sink was installed. */
  getEventLog(): DiagnosticsLog {
    return this.logger.snapshot();
  }

  /** Changes options at runtime. Only the given keys change. */
  setOptions(patch: Partial<PAROptions>): void {
    this.assertAlive();
    const prev = this.opts;
    this.opts = resolveOptions(patch, prev);
    if (this.opts.container !== prev.container || this.opts.video !== prev.video) {
      const diagnosticsEnabled = this.diagnostics.active;
      const loggerEnabled = this.logger.enabled;
      this.unmount();
      this.mount();
      this.scene.setDiagnostics(diagnosticsEnabled);
      this.scene.setLogger(loggerEnabled ? this.logger : null);
      this.scheduler.setMetadataCapture(loggerEnabled);
      this.host.bind();
    } else if (this.opts.zIndex !== prev.zIndex) this.overlay.setZIndex(this.opts.zIndex);
    if (this.opts.warmRangeSeconds !== prev.warmRangeSeconds || this.opts.spriteCacheMB !== prev.spriteCacheMB) this.scene.setWarmRange(this.opts.warmRangeSeconds * 1000);
    if (this.opts.temperature !== prev.temperature) this.scene.setTemperature(this.opts.temperature);
    if (patch.subtitle !== undefined) this.setSubtitle(patch.subtitle);
    this.scheduler.configure(this.opts.fps, this.opts.video);
    this.syncLoop();
    this.configureFonts(this.opts);
    if (patch.fonts) void this.fonts.addMany(patch.fonts);
    this.invalidate();
  }

  /** Renders the subtitle at media time `seconds` (timeOffset and videoFps snapping apply). */
  renderAt(seconds: number): void {
    this.assertAlive();
    this.lastRaw = seconds;
    this.draw(seconds, false);
  }

  /** Re-renders the current time, re-measuring the region. */
  refresh(): void {
    this.assertAlive();
    this.invalidate();
  }

  /**
   * Prepares the loaded subtitle before playback. `source` walks the complete time range through its
   * window and builds every dense scene. The promise is bounded so a blocked source never locks playback.
   */
  async prepare(mode: 'dense' | 'source' = 'source'): Promise<void> {
    this.assertAlive();
    this.scene.setWarmRange(this.opts.warmRangeSeconds * 1000);
    this.invalidate();
    const started = performance.now();
    const endMs = Math.max(0, Math.round((this.host.sourceDuration ?? 0) * 1000));
    const frameReady = (): Promise<boolean> => new Promise((resolve) => {
      const done = (): void => {
        if (this.destroyed) { resolve(true); return; }
        const render = this.getMetrics().render;
        const sourceReady = Number.isFinite(this.lastMs) && this.host.covers(this.lastMs);
        resolve(sourceReady && render.pending === 0 && render.planQueued === 0);
      };
      requestAnimationFrame(done);
    });
    if (mode === 'source') {
      const step = Math.max(1000, this.opts.windowSeconds * 1000);
      for (let windowMs = 0; windowMs <= endMs && !this.destroyed && performance.now() - started < 120_000; windowMs += step) {
        this.host.prepareSource(windowMs);
        this.draw(windowMs / 1000, false);
        while (!(await frameReady())) {
          this.host.prepareSource(windowMs);
          this.draw(windowMs / 1000, false);
          if (this.destroyed || performance.now() - started >= 120_000) break;
        }
      }
      return;
    }
    while (!(await frameReady()) && performance.now() - started < 8000) { /* bounded between-frame planning continues */ }
  }

  getMetrics(): PARMetrics {
    return buildMetrics(this.geo, { time: this.lastMs / 1000, activeLines: this.scene.activeCount, running: this.scheduler.isRunning, render: renderMetrics({ ...this.scene.renderStats, stalls: this.stall.stalls, stallMs: this.stall.stallMs }, this.opts.renderMode, this.frames.snapshot()) });
  }

  /** Removes the overlay, listeners and loop; the instance is dead afterwards. */
  destroy(): void {
    if (this.destroyed) return;
    this.setEventLogger(null);
    this.lastVideoFrame = undefined;
    this.unmount();
    this.disposeFonts();
    this.host.dispose();
    this.diagnostics.setEnabled(false);
    this.destroyed = true;
  }

  /** Fonts changed: measured boxes (collisions) are stale, so rebuild every visible line. */
  protected onFontsChanged(): void {
    if (this.destroyed) return;
    this.diagnostics.clear();
    this.logger.segment();
    this.scene.hold = this.missing.hold;
    this.scene.clear();
    this.scene.setFaces(this.fonts.shipFaces());
    this.invalidate();
  }

  private mount(): void {
    const { container, video } = this.opts;
    this.overlay = new Overlay(container, this.opts.zIndex);
    this.scene = new Scene(this.overlay, () => this.opts.renderMode, this.opts.spriteCacheMB * 1048576, debugWorkers);
    this.scene.setWarmRange(this.opts.warmRangeSeconds * 1000);
    this.scene.setTemperature(this.opts.temperature);
    this.scene.setFaces(this.fonts.shipFaces());
    this.scene.onReady = (epoch, generation) => {
      queueMicrotask(() => {
        if (!this.destroyed && generation === this.renderGeneration && this.scene.readyEpoch === epoch && this.scene.readyGeneration === generation) this.draw(this.now(), false, true);
      });
    };
    this.teardown.push(observeSize(container, video, () => this.invalidate()));
    if (video) {
      const cancelWarm = (): void => {
        this.scene.cancelWarm();
        this.logger.segment();
        this.seekBufferUntilMs = this.opts.seekBuffer ? this.lastMs + 1000 : 0;
      };
      video.addEventListener('seeking', cancelWarm);
      this.teardown.push(() => video.removeEventListener('seeking', cancelWarm));
      this.teardown.push(bindVideoEvents(video, {
        play: () => this.syncLoop(),
        pause: () => { this.syncLoop(); this.draw(this.now(), false); },
        started: () => this.stall.userPlayed(),
        seek: () => {
          this.seekBufferUntilMs = this.opts.seekBuffer ? timeToMs(this.opts.video?.currentTime ?? this.now(), this.opts.videoFps) + 1000 : 0;
          if (!this.scheduler.isRunning) this.draw(this.now(), false);
        },
        resize: () => this.invalidate(),
      }));
    }
    this.scheduler.configure(this.opts.fps, video);
    this.layoutDirty = true;
    this.syncLoop();
  }

  private unmount(): void {
    this.diagnostics.clear();
    this.scheduler.stop();
    this.load.stop();
    this.stall.dispose();
    this.teardown.forEach((undo) => undo());
    this.teardown = [];
    this.scene.dispose();
    this.overlay.destroy();
  }

  /** Runs the loop only while something can change: a playing video, or a free-running custom clock. */
  private syncLoop(): void {
    const { video, clock } = this.opts;
    if (video ? isPlaying(video) : clock !== null) { this.scheduler.start(); this.load.start(); }
    else { this.scheduler.stop(); this.load.stop(); }
  }

  private now(): number { return this.opts.clock ? this.opts.clock() : this.opts.video ? this.opts.video.currentTime : this.lastRaw; }

  private frame(mediaTime: number | null): void {
    const frame = this.lastVideoFrame;
    this.lastVideoFrame = undefined;
    this.draw(this.opts.clock || mediaTime === null ? this.now() : mediaTime, false, false, frame);
  }
  private invalidate(): void {
    if (this.destroyed) return;
    this.layoutDirty = true;
    this.forceNext = true;
    this.draw(this.now(), true);
  }

  private draw(raw: number, force: boolean, retry = false, videoFrame?: VideoFrameMetadata): void {
    const measuring = this.diagnostics.active;
    const prepareStartedAt = measuring ? performance.now() : 0;
    const generation = ++this.renderGeneration;
    if (this.destroyed || !Number.isFinite(raw)) return;
    const ms = timeToMs(raw + this.opts.timeOffset, this.opts.videoFps);
    if (this.fonts.blocking) {
      if (measuring) this.recordPrepareSkip(raw, ms, prepareStartedAt, 0, 0, 'fonts-blocked');
      return;
    }
    const layoutStart = measuring ? performance.now() : 0;
    if (this.layoutDirty) this.relayout();
    const sourceStart = measuring ? performance.now() : 0;
    const relayoutMs = measuring ? sourceStart - layoutStart : 0;
    this.host.update(ms);
    const sourceUpdateMs = measuring ? performance.now() - sourceStart : 0;
    const forced = force || this.forceNext;
    if (!forced && !retry && ms === this.lastMs) {
      if (measuring) this.recordPrepareSkip(raw, ms, prepareStartedAt, relayoutMs, sourceUpdateMs, 'unchanged');
      return;
    }
    const running = this.scheduler.isRunning;
    const sourceCovered = this.host.covers(ms);
    this.scene.setLoad(running ? this.load.late() : null);
    const seekBufferReady = !sourceCovered || this.scene.warmPending() > 0 || !this.scene.readyAt(ms);
    // After a seek, presentation waits for a one-second buffer while the planner computes ahead independently.
    const seekBufferWaiting = this.seekBufferUntilMs > 0 && ms <= this.seekBufferUntilMs && !seekBufferReady;
    if (this.seekBufferUntilMs !== 0 && (ms > this.seekBufferUntilMs || seekBufferReady)) this.seekBufferUntilMs = 0;
    // A frame is presented whole or not at all while the picture can wait for it (paused, seeking, a video the renderer may hold);
    // a free-running custom clock cannot be held: it draws what is ready (the missing are counted) and the builders rush the rest.
    // While the warm-up window is active, source gaps are held rather than presented with a partial picture.
    const presentationHold = !running || seekBufferWaiting || (this.opts.video && this.scene.buffers);
    let complete = true;
    const source = measuring ? this.host.stats() : null;
    const sourceReady = measuring ? sourceCovered : false;
    const policy = presentationHold && !this.scene.stuck ? 'hold' : 'partial';
    const renderStart = measuring ? performance.now() : 0;
    this.frames.time(() => { complete = this.scene.render(ms, this.env, forced, policy, generation, raw); });
    if (this.diagnostics.active) {
      const sample = this.scene.diagnostics;
      const completedAt = performance.now();
      if (sample) this.diagnostics.record({ ...sample, media: raw, presented: complete || policy === 'partial', held: !complete && policy === 'hold',
        prepareStartedAt, completedAt, prepareMs: renderStart - prepareStartedAt, relayoutMs, sourceUpdateMs, sourceReady,
        sourceLoading: source!.loading, windowRange: source!.windowRange, windowApplyTotalMs: source!.windowApplyTotalMs,
        windowPrepareTotalMs: source!.windowPrepareTotalMs, sceneRendered: true,
        rendererSubmitted: complete && sourceReady && sample.visible.length > 0 && (this.scene.renderStats.domLines > 0 || this.scene.renderStats.canvas.drawn > 0),
        renderMs: completedAt - renderStart, videoFrame: videoFrame ? { ...videoFrame } : undefined });
    }
    if (running && this.opts.video && this.scene.buffers) this.stall.consider(this.scene.deficit(ms));
    if (!complete && policy === 'hold') {
      // The attempted frame has applied layout/DOM state; readiness retries must not force static lines again.
      this.forceNext = false;
      return; // held: `onReady` draws it again; the previous picture stays
    }
    [this.forceNext, this.lastMs] = [false, ms];
  }

  private recordPrepareSkip(raw: number, ms: number, prepareStartedAt: number, relayoutMs: number, sourceUpdateMs: number, skipReason: 'unchanged' | 'fonts-blocked'): void {
    const source = this.host.stats();
    const sourceReady = this.host.covers(ms);
    const completedAt = performance.now();
    this.diagnostics.record({ sceneMs: 0, renderMs: 0, domMs: null, canvasMs: null, visible: [], route: [], canvas: null,
      media: raw, presented: false, held: false, sceneRendered: false, rendererSubmitted: false, skipReason,
      prepareStartedAt, completedAt, prepareMs: completedAt - prepareStartedAt, relayoutMs, sourceUpdateMs,
      sourceReady, sourceLoading: source.loading, windowRange: source.windowRange,
      windowApplyTotalMs: source.windowApplyTotalMs, windowPrepareTotalMs: source.windowPrepareTotalMs });
  }

  private relayout(): void {
    this.layoutDirty = false;
    const { region, layout, resolved, transform: st } = computeStage(this.opts, this.host.info);
    const prev = this.env;
    if (prev.layout.width !== layout.width || prev.layout.height !== layout.height) {
      this.scene.clear();
      this.logger.segment();
    }
    const devScale = deviceScale(this.opts.container, region.width, layout.width);
    this.env = { ...prev, layout, borderScale: st.borderScale, blurScale: st.blurScale, devScale, frameMs: 1000 / (this.opts.videoFps ?? 24) };
    this.forceNext ||= st.borderScale !== prev.borderScale || st.blurScale !== prev.blurScale || devScale !== prev.devScale;
    this.geo = { region, scale: { x: st.scaleX, y: st.scaleY }, layout: resolved };
    this.overlay.place(region, layout);
  }

  private assertAlive(): void { if (this.destroyed) throw new Error('PAR: this renderer was destroyed'); }
}
