import { Scheduler } from '../clock/Scheduler';
import { bindVideoEvents, isPlaying } from '../clock/videoEvents';
import { parseScript } from '../parser/ScriptParser';
import type { LineEnv } from '../render/LineView';
import { Overlay } from '../render/Overlay';
import type { PARMetrics, PAROptions, Rect, ResolvedOptions } from '../types/options';
import type { ParsedScript } from '../types/script';

import { FontApi } from './FontApi';
import { observeSize } from './observe';
import { computeStage } from './stage';
import { resolveOptions, snapToFrame } from './options';
import { Scene } from './Scene';

/** The PAR renderer instance. Create it with `PAR.create(options)` or `new PARRenderer(options)`. */
export class PARRenderer extends FontApi {
  private opts: ResolvedOptions;
  private overlay!: Overlay;
  private scene!: Scene;
  private parsed: ParsedScript | null = null;
  private readonly scheduler: Scheduler;
  /** Undo functions of everything `mount()` attached (size observer, video listeners). */
  private teardown: Array<() => void> = [];
  private env: LineEnv = { layout: { width: 384, height: 288 }, styles: new Map(), borderScale: 1, fonts: this.fonts };
  private region: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private scale = { x: 0, y: 0 };
  private layoutDirty = true;
  private forceNext = true;
  private lastTime = NaN;
  private lastRaw = 0;
  private destroyed = false;

  constructor(options: PAROptions) {
    super();
    this.opts = resolveOptions(options);
    this.scheduler = new Scheduler((mediaTime) => this.frame(mediaTime));
    this.mount();
    this.configureFonts();
    if (options.fonts) void this.fonts.addMany(options.fonts);
    if (options.subtitle !== undefined) this.setSubtitle(options.subtitle);
  }

  /** Parsed script (read-only view), or null when none is loaded. */
  get script(): ParsedScript | null {
    return this.parsed;
  }

  /** The overlay root element (inside the container). */
  get element(): HTMLElement {
    return this.overlay.root;
  }

  /** Loads (or with null/'' clears) the subtitle. Never throws on malformed scripts. */
  setSubtitle(text: string | null): void {
    this.assertAlive();
    this.parsed = text ? parseScript(text) : null;
    const styles = this.parsed?.styles ?? new Map();
    this.env = { ...this.env, styles };
    this.scene.setScript(this.parsed);
    this.fonts.setScript(text, this.scene.prepared, styles);
    this.invalidate();
  }

  /** Changes options at runtime. Only the given keys change. */
  setOptions(patch: Partial<PAROptions>): void {
    this.assertAlive();
    const prev = this.opts;
    this.opts = resolveOptions(patch, prev);
    if (this.opts.container !== prev.container || this.opts.video !== prev.video) {
      this.unmount();
      this.mount();
      this.scene.setScript(this.parsed);
    } else if (this.opts.zIndex !== prev.zIndex) this.overlay.setZIndex(this.opts.zIndex);
    if (patch.subtitle !== undefined) this.setSubtitle(patch.subtitle);
    this.scheduler.configure(this.opts.fps, this.opts.video);
    this.syncLoop();
    this.configureFonts();
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
    return {
      region: { ...this.region }, layout: { ...this.env.layout }, scaleX: this.scale.x, scaleY: this.scale.y,
      time: this.lastTime, activeLines: this.scene.activeCount, running: this.scheduler.isRunning,
    };
  }

  /** Removes the overlay, listeners and loop. The instance cannot be used afterwards. */
  destroy(): void {
    if (this.destroyed) return;
    this.unmount();
    this.fonts.dispose();
    this.destroyed = true;
    this.parsed = null;
  }

  /** Fonts changed: measured boxes (collisions) are stale, so rebuild every visible line. */
  protected onFontsChanged(): void {
    if (this.destroyed) return;
    this.scene.clear();
    this.invalidate();
  }

  private configureFonts(): void {
    const { fontMap, embeddedFonts, useLocalFonts } = this.opts;
    this.fonts.configure({ fontMap, embedded: embeddedFonts, useLocalFonts });
  }

  private mount(): void {
    const { container, video } = this.opts;
    this.overlay = new Overlay(container, this.opts.zIndex);
    this.scene = new Scene(this.overlay);
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
    this.teardown.forEach((undo) => undo());
    this.teardown = [];
    this.scene.clear();
    this.overlay.destroy();
  }

  /** Runs the loop only while something can change: a playing video, or a free-running custom clock. */
  private syncLoop(): void {
    const { video, clock } = this.opts;
    if (video ? isPlaying(video) : clock !== null) this.scheduler.start();
    else this.scheduler.stop();
  }

  private now(): number {
    const { clock, video } = this.opts;
    return clock ? clock() : video ? video.currentTime : this.lastRaw;
  }

  private frame(mediaTime: number | null): void {
    this.draw(this.opts.clock || mediaTime === null ? this.now() : mediaTime, false);
  }

  private invalidate(): void {
    if (this.destroyed) return;
    this.layoutDirty = true;
    this.forceNext = true;
    this.draw(this.now(), true);
  }

  private draw(raw: number, force: boolean): void {
    if (this.destroyed || !Number.isFinite(raw) || this.fonts.blocking) return;
    const t = snapToFrame(raw + this.opts.timeOffset, this.opts.videoFps);
    if (this.layoutDirty) this.relayout();
    const forced = force || this.forceNext;
    if (!forced && t === this.lastTime) return;
    this.scene.render(t, this.env, forced);
    this.forceNext = false;
    this.lastTime = t;
  }

  private relayout(): void {
    this.layoutDirty = false;
    const { region, layout, transform: st } = computeStage(this.opts, this.parsed?.info ?? null);
    const prev = this.env;
    if (prev.layout.width !== layout.width || prev.layout.height !== layout.height) this.scene.clear();
    this.env = { ...prev, layout, borderScale: st.borderScale };
    if (st.borderScale !== prev.borderScale) this.forceNext = true;
    this.region = region;
    this.scale = { x: st.scaleX, y: st.scaleY };
    this.overlay.place(region, layout);
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('PAR: this renderer was destroyed');
  }
}
