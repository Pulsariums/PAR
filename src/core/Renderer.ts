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
import { Refiner } from './Refiner';
import { observeSize } from './observe';
import { computeStage, deviceScale } from './stage';
import { resolveOptions } from './options';
import { buildMetrics, renderMetrics, type Geometry } from './metrics';
import { Scene } from './Scene';
import { ScriptHost } from './ScriptHost';
import { timeToMs } from './time';
import type { SourceStatsReport } from './WindowFeed';

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
  private destroyed = false;
  private readonly frames = new FrameStats();
  private readonly refiner = new Refiner(() => this.draw(this.now(), true));
  constructor(options: PAROptions) {
    super();
    this.opts = resolveOptions(options);
    this.scheduler = new Scheduler((mediaTime) => this.frame(mediaTime));
    this.host = new ScriptHost({
      scene: () => this.scene, fonts: this.fonts, windowSeconds: () => this.opts.windowSeconds, reset: () => this.resetMissing(),
      changed: () => { this.env = { ...this.env, styles: this.host.styles }; this.forceNext = true; this.draw(this.now(), false); },
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
    this.host.load(input || null);
    this.env = { ...this.env, styles: this.host.styles };
    this.invalidate();
  }

  /** Window / source numbers: events in memory, loaded range, whether a read is running, bytes read and decode time. */
  getSourceStats(): SourceStatsReport {
    return this.host.stats();
  }

  /** Changes options at runtime. Only the given keys change. */
  setOptions(patch: Partial<PAROptions>): void {
    this.assertAlive();
    const prev = this.opts;
    this.opts = resolveOptions(patch, prev);
    if (this.opts.container !== prev.container || this.opts.video !== prev.video) {
      this.unmount();
      this.mount();
      this.host.bind();
    } else if (this.opts.zIndex !== prev.zIndex) this.overlay.setZIndex(this.opts.zIndex);
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

  getMetrics(): PARMetrics {
    return buildMetrics(this.geo, { time: this.lastMs / 1000, activeLines: this.scene.activeCount, running: this.scheduler.isRunning, render: renderMetrics(this.scene.renderStats, this.opts.renderMode, this.frames.snapshot()) });
  }

  /** Removes the overlay, listeners and loop; the instance is dead afterwards. */
  destroy(): void {
    if (this.destroyed) return;
    this.unmount();
    this.disposeFonts();
    this.host.dispose();
    this.destroyed = true;
  }

  /** Fonts changed: measured boxes (collisions) are stale, so rebuild every visible line. */
  protected onFontsChanged(): void {
    if (this.destroyed) return;
    this.scene.hold = this.missing.hold;
    this.scene.clear();
    this.invalidate();
  }

  private mount(): void {
    const { container, video } = this.opts;
    this.overlay = new Overlay(container, this.opts.zIndex);
    this.scene = new Scene(this.overlay, () => this.opts.renderMode, this.opts.spriteCacheMB * 1048576);
    this.teardown.push(observeSize(container, video, () => this.invalidate()));
    if (video) {
      this.teardown.push(bindVideoEvents(video, {
        play: () => this.syncLoop(),
        pause: () => { this.syncLoop(); this.draw(this.now(), false); },
        seek: () => { if (!this.scheduler.isRunning) this.draw(this.now(), false); },
        resize: () => this.invalidate(),
      }));
    }
    this.scheduler.configure(this.opts.fps, video);
    this.layoutDirty = true;
    this.syncLoop();
  }

  private unmount(): void {
    this.scheduler.stop();
    this.refiner.cancel();
    this.teardown.forEach((undo) => undo());
    this.teardown = [];
    this.scene.dispose();
    this.overlay.destroy();
  }

  /** Runs the loop only while something can change: a playing video, or a free-running custom clock. */
  private syncLoop(): void {
    const { video, clock } = this.opts;
    if (video ? isPlaying(video) : clock !== null) this.scheduler.start();
    else this.scheduler.stop();
  }

  private now(): number { return this.opts.clock ? this.opts.clock() : this.opts.video ? this.opts.video.currentTime : this.lastRaw; }

  private frame(mediaTime: number | null): void { this.draw(this.opts.clock || mediaTime === null ? this.now() : mediaTime, false); }
  private invalidate(): void {
    if (this.destroyed) return;
    this.layoutDirty = true;
    this.forceNext = true;
    this.draw(this.now(), true);
  }

  private draw(raw: number, force: boolean): void {
    if (this.destroyed || !Number.isFinite(raw) || this.fonts.blocking) return;
    const ms = timeToMs(raw + this.opts.timeOffset, this.opts.videoFps);
    if (this.layoutDirty) this.relayout();
    this.host.update(ms);
    const forced = force || this.forceNext;
    if (!forced && ms === this.lastMs) return;
    this.frames.time(() => this.scene.render(ms, this.env, forced));
    if (this.scene.needsRefine) this.refiner.request();
    [this.forceNext, this.lastMs] = [false, ms];
  }

  private relayout(): void {
    this.layoutDirty = false;
    const { region, layout, resolved, transform: st } = computeStage(this.opts, this.host.info);
    const prev = this.env;
    if (prev.layout.width !== layout.width || prev.layout.height !== layout.height) this.scene.clear();
    const devScale = deviceScale(this.opts.container, region.width, layout.width);
    this.env = { ...prev, layout, borderScale: st.borderScale, blurScale: st.blurScale, devScale, frameMs: 1000 / (this.opts.videoFps ?? 24) };
    this.forceNext ||= st.borderScale !== prev.borderScale || st.blurScale !== prev.blurScale || devScale !== prev.devScale;
    this.geo = { region, scale: { x: st.scaleX, y: st.scaleY }, layout: resolved };
    this.overlay.place(region, layout);
  }

  private assertAlive(): void { if (this.destroyed) throw new Error('PAR: this renderer was destroyed'); }
}
