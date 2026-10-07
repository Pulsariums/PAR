import { evalStates, prepareLine, type PreparedLine } from '../anim/Prepared';
import { collisionShift, type Placed } from '../layout/Collision';
import { inflate, stackDirection } from '../layout/Stacking';
import { CanvasPath, type Policy } from '../canvas/CanvasPath';
import type { SpriteWorkers } from '../canvas/workers/size';
import type { CanvasStats, RenderMode } from '../canvas/types';
import type { FaceInfo } from '../canvas/workers/pool';
import { LineView, type LineEnv } from '../render/LineView';
import type { Overlay } from '../render/Overlay';
import type { AssEvent, ParsedScript } from '../types/script';

import { Lookahead } from './Lookahead';
import { Timeline } from './Timeline';

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
  private readonly ahead: Lookahead;
  private canvasOn = false;

  constructor(private readonly overlay: Overlay, mode: () => RenderMode = () => 'auto', cacheBytes = 96 << 20, workers: () => SpriteWorkers = () => 'auto') {
    this.canvas = new CanvasPath(overlay, mode, cacheBytes);
    this.ahead = new Lookahead(this.canvas, () => ({
      startingIn: (a, b) => this.timeline.startingIn(a, b), visibleAt: (t) => this.timeline.visibleAt(t), startMs: this.startOf, covers: this.covers,
    }), workers);
  }

  /** Fonts the page has loaded (bytes), for the sprite workers. */
  setFaces(faces: FaceInfo[]): void { this.ahead.setFaces(faces); }

  /** Counters of the canvas path and how many visible lines each path draws. */
  get renderStats(): { canvas: CanvasStats; domLines: number; canvasLines: number } {
    return { canvas: { ...this.canvas.stats(), ...this.ahead.stats() }, domLines: this.views.size, canvasLines: this.canvasLines };
  }

  private canvasLines = 0;

  /** Share of recent display frames that were late while playing, null when not playing (see `LoadMeter`). */
  setLoad(late: number | null): void { this.canvas.load = late; }

  /** A frame that lacked sprites has them now (see `Lookahead.onReady`): the owner draws it again. */
  set onReady(fn: () => void) { this.ahead.onReady = fn; }

  /** Ms the playhead would have to wait for every planned sprite to be built before its frame; 0 = playing on is safe. */
  deficit(t: number): number { return this.ahead.deficit(t); }

  /** Sprite workers are running (page-thread building alone is too slow to buy time by holding the picture). */
  get buffers(): boolean { return this.ahead.hasWorkers; }

  /** Work is planned and nothing is working on it: a frame waiting for it would wait forever. */
  get stuck(): boolean { return this.ahead.stuck; }

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
  render(t: number, env: LineEnv, force: boolean, policy: Policy = 'partial'): boolean {
    this.ahead.begin(t, env);
    let complete = true;
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
      complete = this.canvas.render(visible.map((line, i) => ({ line, rel: t - this.timeline.startMs(line), canvas: route[i] })), env, policy);
      this.canvasOn = this.canvasLines > 0;
      this.ahead.note(t, env, performance.now() - t0);
    } else this.ahead.note(t, env, null); // No canvas line on screen: the next burst still needs its sprites, so look ahead now and then.
    return complete;
  }

  private readonly startOf = (l: PreparedLine): number => this.timeline.startMs(l);

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
    this.ahead.clear();
    this.canvasOn = false;
    this.canvasLines = 0;
  }

  /** Releases the canvases too (the renderer unmounts). */
  dispose(): void {
    this.clear();
    this.ahead.dispose();
    this.canvas.destroy();
  }
}
