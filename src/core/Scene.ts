import { evalStates, prepareLine, type PreparedLine } from '../anim/Prepared';
import { collisionShift, type Placed } from '../layout/Collision';
import { inflate, stackDirection } from '../layout/Stacking';
import { CanvasPath } from '../canvas/CanvasPath';
import { newWarmState, warmUp, type WarmState } from '../canvas/warm';
import type { CanvasStats, RenderMode } from '../canvas/types';
import { LineView, type LineEnv } from '../render/LineView';
import type { Overlay } from '../render/Overlay';
import type { AssEvent, ParsedScript } from '../types/script';

import { Timeline } from './Timeline';

/** How far ahead (ms of subtitle time) sprites are built. */
const HORIZON_MS = 5000;
/** No frame drawn for this long (ms) = nothing is playing: idle slices may be long. */
const IDLE_AFTER_MS = 120;
const IDLE_SLICE_MS = 10;
/** Without canvas lines on screen, the lookahead runs on every this-many-th render. */
const QUIET_EVERY = 6;

/**
 * Keeps the DOM in sync with the visible events: builds a LineView when an event appears,
 * updates only animated lines per frame, and releases the DOM when it disappears.
 */
export class Scene {
  private timeline = new Timeline([]);
  private readonly views = new Map<string, LineView>();
  private readonly placed = new Map<string, Placed>();
  /** Event indexes that must not be drawn (lines waiting for a missing font). */
  hold: ReadonlySet<number> | null = null;
  /** Windowed script: prepared lines by event index, kept across window updates. */
  private readonly cache = new Map<number, PreparedLine>();
  /** Windowed script: lines are only drawn while this says the time is loaded. */
  covers: ((tMs: number) => boolean) | null = null;

  private readonly canvas: CanvasPath;
  private readonly warm: WarmState = newWarmState();
  /** Idle warm-up pump (see `pump`) and what it needs to know about the last drawn frame. */
  private pumpArmed = false;
  /** Bumped to cancel a queued slice (clear / new script). */
  private pumpGen = 0;
  private lastDrawAt = 0;
  private lastT = 0;
  private lastEnv: LineEnv | null = null;
  private frameCost = 0;
  private quiet = 0;
  private canvasOn = false;

  constructor(private readonly overlay: Overlay, mode: () => RenderMode = () => 'auto', cacheBytes = 96 << 20) {
    this.canvas = new CanvasPath(overlay, mode, cacheBytes);
  }

  /** Counters of the canvas path and how many visible lines each path draws. */
  get renderStats(): { canvas: CanvasStats; domLines: number; canvasLines: number } {
    return { canvas: this.canvas.stats(), domLines: this.views.size, canvasLines: this.canvasLines };
  }

  private canvasLines = 0;

  /** The last frame shipped reduced (see `Refiner`): draw it again. */
  get needsRefine(): boolean { return this.canvas.deferred > 0; }

  setScript(script: ParsedScript | null): void {
    this.clear();
    this.cache.clear();
    this.covers = null;
    this.timeline = script
      ? new Timeline(script.events.map((e) => prepareLine(e, script.styles, script.info)))
      : new Timeline([]);
  }

  /** Windowed script: applies a window change. Returns the newly prepared lines (what the font layer scans). */
  setWindow(events: readonly AssEvent[], added: readonly AssEvent[], removed: readonly number[], script: Pick<ParsedScript, 'styles' | 'info'>): PreparedLine[] {
    removed.forEach((i) => this.cache.delete(i));
    const fresh = added.map((e) => prepareLine(e, script.styles, script.info));
    fresh.forEach((l) => this.cache.set(l.event.index, l));
    this.timeline = new Timeline(events.map((e) => this.cache.get(e.index)!).filter(Boolean));
    return fresh;
  }

  /** Every prepared line of the loaded script (what the font layer scans). */
  get prepared(): readonly PreparedLine[] {
    return this.timeline.all;
  }

  get activeCount(): number {
    return this.views.size + this.canvasLines;
  }

  /** Renders at integer ms `t`. `force` re-applies static lines too (after layout/option changes). */
  render(t: number, env: LineEnv, force: boolean): void {
    const all = this.covers && !this.covers(t) ? [] : this.timeline.visibleAt(t);
    const visible = this.hold ? all.filter((l) => !this.hold!.has(l.event.index)) : all;
    const route = this.canvas.route(visible, t);
    const ids = new Set(visible.filter((_, i) => !route[i]).map((l) => l.event.id));
    for (const [id, view] of this.views) {
      if (ids.has(id)) continue;
      view.destroy();
      this.views.delete(id);
      this.placed.delete(id);
    }
    visible.forEach((line, i) => { if (!route[i]) this.renderDom(line, t, env, force); });
    this.canvasLines = route.filter(Boolean).length;
    if (this.canvasLines > 0 || this.canvasOn) {
      const t0 = performance.now();
      this.canvas.render(visible.map((line, i) => ({ line, rel: t - this.timeline.startMs(line), canvas: route[i] })), env);
      this.canvasOn = this.canvasLines > 0;
      this.lookahead(t, env, performance.now() - t0);
    } else if (++this.quiet % QUIET_EVERY === 0) {
      // No canvas line on screen: the next burst still needs its sprites, so look ahead now and then.
      this.lookahead(t, env, null);
    }
  }

  /**
   * Builds the sprites of events starting soon. A small slice runs inside the frame; when work is left, `pump` carries on between
   * frames: a burst of a thousand new events needs far more build time than the frames before it can spare, so it is spread over
   * the seconds ahead (nearest start first), in slices sized from what recent frames cost.
   */
  private lookahead(t: number, env: LineEnv, spentMs: number | null): void {
    if (!this.canvas.enabled) return;
    this.lastT = t;
    this.lastEnv = env;
    if (spentMs !== null) this.lastDrawAt = performance.now();
    if (spentMs !== null) this.frameCost = this.frameCost === 0 ? spentMs : this.frameCost * 0.8 + spentMs * 0.2;
    const w = warmUp(this.canvas, this.timeline.startingIn(t, t + HORIZON_MS), t, env, env.frameMs ?? 41.7, 1.5, this.warm, this.startOf);
    if (w.more) this.arm();
  }

  private readonly startOf = (l: PreparedLine): number => this.timeline.startMs(l);

  private arm(): void {
    if (this.pumpArmed) return;
    this.pumpArmed = true;
    const gen = this.pumpGen;
    const run = (): void => { if (gen === this.pumpGen) this.pump(); };
    if (typeof MessageChannel === 'undefined') { setTimeout(run, 0); return; }
    // A message task, not `setTimeout(0)`: timers are clamped to 4 ms once nested, which left the pump idle two thirds of the time.
    const ch = new MessageChannel();
    ch.port1.onmessage = () => { ch.port1.close(); run(); };
    ch.port2.postMessage(0);
  }

  /**
   * One slice between frames. While frames are being drawn it is sized to leave room for the next one (the frame's own cost
   * measured); with nothing drawn lately (paused, between bursts) the main thread is free and slices are long.
   */
  private pump(): void {
    this.pumpArmed = false;
    const env = this.lastEnv;
    if (!env || !this.canvas.enabled) return;
    const playing = performance.now() - this.lastDrawAt < IDLE_AFTER_MS;
    const budget = playing ? Math.max(1.5, Math.min(6, 13 - this.frameCost)) : IDLE_SLICE_MS;
    const w = warmUp(this.canvas, this.timeline.startingIn(this.lastT, this.lastT + HORIZON_MS), this.lastT, env, env.frameMs ?? 41.7, budget, this.warm, this.startOf);
    if (w.more) this.arm();
  }

  private renderDom(line: PreparedLine, t: number, env: LineEnv, force: boolean): void {
    const rel = t - this.timeline.startMs(line);
    const existing = this.views.get(line.event.id);
    if (existing) {
      existing.update(rel, env, force);
      return;
    }
    const view = new LineView(line);
    this.views.set(line.event.id, view);
    this.overlay.insert(view.root, line.event.layer, line.event.index);
    view.update(rel, env, true);
    if (line.stacks) this.place(view, env, rel);
  }

  /** Collision handling for unpositioned lines (lines already on screen keep their place). */
  private place(view: LineView, env: LineEnv, rel: number): void {
    const measured = view.measure(env.layout);
    if (measured.bottom - measured.top <= 0) return;
    const border = Math.max(0, ...evalStates(view.line, rel, env.styles).map((s) => Math.max(s.xbord, s.ybord))) * env.borderScale;
    const box = inflate(measured, border);
    const layer = view.line.event.layer;
    const shift = collisionShift(box, layer, stackDirection(view.line.an), [...this.placed.values()]);
    if (shift !== 0) {
      view.shiftY = shift;
      view.update(rel, env, true);
    }
    this.placed.set(view.line.event.id, { layer, box: { ...box, top: box.top + shift, bottom: box.bottom + shift } });
  }

  clear(): void {
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    this.placed.clear();
    this.canvas.clear();
    this.warm.done.clear();
    this.warm.next.clear();
    this.pumpGen++;
    this.pumpArmed = false;
    this.lastEnv = null;
    this.canvasOn = false;
    this.canvasLines = 0;
  }

  /** Releases the canvases too (the renderer unmounts). */
  dispose(): void {
    this.clear();
    this.canvas.destroy();
  }
}
