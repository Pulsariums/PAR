import { Scheduler } from '../clock/Scheduler';
import { bindVideoEvents, isPlaying } from '../clock/videoEvents';
import { resolveLayoutSize, stageTransform } from '../layout/Layout';
import { resolveRegion } from '../layout/Region';
import { parseScript } from '../parser/ScriptParser';
import type { LineEnv } from '../render/LineView';
import { Overlay } from '../render/Overlay';
import type { PARMetrics, PAROptions, Rect, ResolvedOptions } from '../types/options';
import type { ParsedScript } from '../types/script';

import { measureRegionInput } from './measure';
import { resolveOptions, snapToFrame } from './options';
import { Scene } from './Scene';

/** The PAR renderer instance. Create it with `PAR.create(options)` or `new PARRenderer(options)`. */
export class PARRenderer {
  private opts: ResolvedOptions;
  private overlay!: Overlay;
  private scene!: Scene;
  private parsed: ParsedScript | null = null;
  private readonly scheduler: Scheduler;
  private unbind: (() => void) | null = null;
  private ro: ResizeObserver | null = null;
  private env: LineEnv = { layout: { width: 384, height: 288 }, styles: new Map(), borderScale: 1, fontMap: {} };
  private region: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private scale = { x: 0, y: 0 };
  private layoutDirty = true;
  private forceNext = true;
  private lastTime = NaN;
  private lastRaw = 0;
  private destroyed = false;

  constructor(options: PAROptions) {
    this.opts = resolveOptions(options);
    this.scheduler = new Scheduler((mediaTime) => this.frame(mediaTime));
    this.mount();
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
    this.env = { ...this.env, styles: this.parsed?.styles ?? new Map() };
    this.scene.setScript(this.parsed);
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
    this.env = { ...this.env, fontMap: this.opts.fontMap };
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
      region: { ...this.region },
      layout: { ...this.env.layout },
      scaleX: this.scale.x,
      scaleY: this.scale.y,
      time: this.lastTime,
      activeLines: this.scene.activeCount,
      running: this.scheduler.isRunning,
    };
  }

  /** Removes the overlay, listeners and loop. The instance cannot be used afterwards. */
  destroy(): void {
    if (this.destroyed) return;
    this.unmount();
    this.destroyed = true;
    this.parsed = null;
  }

  private mount(): void {
    const { container, video } = this.opts;
    this.overlay = new Overlay(container, this.opts.zIndex);
    this.scene = new Scene(this.overlay);
    this.env = { ...this.env, fontMap: this.opts.fontMap };
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => this.invalidate());
      this.ro.observe(container);
      if (video) this.ro.observe(video);
    }
    if (video) {
      this.unbind = bindVideoEvents(video, {
        play: () => this.syncLoop(),
        pause: () => { this.syncLoop(); this.draw(this.now(), false); },
        seek: () => { if (!this.scheduler.isRunning) this.draw(this.now(), false); },
        resize: () => this.invalidate(),
      });
    }
    this.scheduler.configure(this.opts.fps, video);
    this.layoutDirty = true;
    this.syncLoop();
  }

  private unmount(): void {
    this.scheduler.stop();
    this.unbind?.();
    this.unbind = null;
    this.ro?.disconnect();
    this.ro = null;
    this.scene.clear();
    this.overlay.destroy();
  }

  /** Runs the loop only while something can change: a playing video, or a free-running custom clock. */
  private syncLoop(): void {
    const { video, clock } = this.opts;
    const run = video ? isPlaying(video) : clock !== null;
    if (run) this.scheduler.start();
    else this.scheduler.stop();
  }

  private now(): number {
    const { clock, video } = this.opts;
    if (clock) return clock();
    if (video) return video.currentTime;
    return this.lastRaw;
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
    if (this.destroyed || !Number.isFinite(raw)) return;
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
    const input = measureRegionInput(this.opts.container, this.opts.video);
    this.region = resolveRegion(this.opts.region, input);
    const layout = resolveLayoutSize(this.opts.layout, this.parsed?.info ?? null);
    const st = stageTransform(this.region, layout, this.parsed?.info.scaledBorderAndShadow ?? true);
    const prev = this.env;
    if (prev.layout.width !== layout.width || prev.layout.height !== layout.height) this.scene.clear();
    this.env = { ...prev, layout, borderScale: st.borderScale };
    if (st.borderScale !== prev.borderScale) this.forceNext = true;
    this.scale = { x: st.scaleX, y: st.scaleY };
    this.overlay.place(this.region, layout);
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('PAR: this renderer was destroyed');
  }
}
