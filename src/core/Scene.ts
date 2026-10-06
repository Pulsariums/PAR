import { prepareLine, type PreparedLine } from '../anim/Prepared';
import { alignY } from '../layout/Anchor';
import { collisionShift, type Placed } from '../layout/Collision';
import { LineView, type LineEnv } from '../render/LineView';
import type { Overlay } from '../render/Overlay';
import type { ParsedScript } from '../types/script';

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

  constructor(private readonly overlay: Overlay) {}

  setScript(script: ParsedScript | null): void {
    this.clear();
    this.timeline = script
      ? new Timeline(script.events.map((e) => prepareLine(e, script.styles, script.info)))
      : new Timeline([]);
  }

  /** Every prepared line of the loaded script (what the font layer scans). */
  get prepared(): readonly PreparedLine[] {
    return this.timeline.all;
  }

  get activeCount(): number {
    return this.views.size;
  }

  /** Renders at `t` seconds. `force` re-applies static lines too (after layout/option changes). */
  render(t: number, env: LineEnv, force: boolean): void {
    const all = this.timeline.visibleAt(t);
    const visible = this.hold ? all.filter((l) => !this.hold!.has(l.event.index)) : all;
    const ids = new Set(visible.map((l) => l.event.id));
    for (const [id, view] of this.views) {
      if (ids.has(id)) continue;
      view.destroy();
      this.views.delete(id);
      this.placed.delete(id);
    }
    for (const line of visible) {
      const rel = (t - line.event.start) * 1000;
      const existing = this.views.get(line.event.id);
      if (existing) {
        existing.update(rel, env, force);
        continue;
      }
      const view = new LineView(line);
      this.views.set(line.event.id, view);
      this.overlay.insert(view.root, line.event.layer, line.event.index);
      view.update(rel, env, true);
      if (!line.positioned) this.place(view, env, rel);
    }
  }

  /** Collision handling for unpositioned lines (lines already on screen keep their place). */
  private place(view: LineView, env: LineEnv, rel: number): void {
    const ay = alignY(view.line.an);
    if (ay === 0.5) return;
    const box = view.measure(env.layout);
    if (box.bottom - box.top <= 0) return;
    const layer = view.line.event.layer;
    const shift = collisionShift(box, layer, ay === 1 ? -1 : 1, [...this.placed.values()]);
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
  }
}
