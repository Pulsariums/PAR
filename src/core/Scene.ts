import { evalStates, prepareLine, type PreparedLine } from '../anim/Prepared';
import { collisionShift, type Placed } from '../layout/Collision';
import { inflate, stackDirection } from '../layout/Stacking';
import { CanvasPath, type Policy } from '../canvas/CanvasPath';
import type { SpriteWorkers } from '../canvas/workers/size';
import type { CanvasStats, RenderMode } from '../canvas/types';
import type { FaceInfo } from '../canvas/workers/pool';
import { LineView, type LineEnv } from '../render/LineView';
import type { Overlay } from '../render/Overlay';
import type { AssEvent, AssStyle, DrawCommand, ParsedScript } from '../types/script';

import { Lookahead } from './Lookahead';
import { Timeline } from './Timeline';
import { RenderLogger, type SceneDiagnosticsSample } from './Diagnostics';
import type { CanvasMarkerOutcome } from '../canvas/CanvasLayer';
import { parseDrawing, rectOfDrawing } from '../parser/DrawingParser';
import { msOf } from './time';

export const MAX_DOM_BUDGET = 256;

interface StripClip {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isVertical: boolean;
}

const stripClipCache = new WeakMap<PreparedLine, StripClip | null>();

function extractRectFromDrawing(cmds: DrawCommand[]): [number, number, number, number] | null {
  const r = rectOfDrawing(cmds);
  if (r) return r;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < cmds.length; i++) {
    const c = cmds[i];
    if (i === 0 ? c.cmd !== 'm' : c.cmd !== 'l') return null;
    if (c.pts.length !== 1) return null;
    pts.push(c.pts[0]);
  }
  if (pts.length === 5 && Math.abs(pts[4][0] - pts[0][0]) < 0.05 && Math.abs(pts[4][1] - pts[0][1]) < 0.05) {
    pts.pop();
  }
  if (pts.length !== 4) return null;
  const isH = (p1: [number, number], p2: [number, number]) => Math.abs(p1[1] - p2[1]) < 0.05;
  const isV = (p1: [number, number], p2: [number, number]) => Math.abs(p1[0] - p2[0]) < 0.05;
  const ok = (
    (isH(pts[0], pts[1]) && isV(pts[1], pts[2]) && isH(pts[2], pts[3]) && isV(pts[3], pts[0])) ||
    (isV(pts[0], pts[1]) && isH(pts[1], pts[2]) && isV(pts[2], pts[3]) && isH(pts[3], pts[0]))
  );
  if (!ok) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function extractStripClip(line: PreparedLine): StripClip | null {
  if (line.clipTransitions.length > 0) return null;

  const clip = line.event.lineTags.clip;
  if (clip && !clip.inverse && clip.rect) {
    const [rx1, ry1, rx2, ry2] = clip.rect;
    const x1 = Math.min(rx1, rx2);
    const y1 = Math.min(ry1, ry2);
    const x2 = Math.max(rx1, rx2);
    const y2 = Math.max(ry1, ry2);
    const w = x2 - x1;
    const h = y2 - y1;
    if (w <= 0 || h <= 0) return null;
    if (w <= 1.05 || h <= 1.05) {
      return { x1, y1, x2, y2, isVertical: w <= 1.05 || w <= h };
    }
  }

  const vclip = line.event.lineTags.vclip;
  if (vclip && !vclip.inverse && vclip.drawing) {
    const cmds = parseDrawing(vclip.drawing);
    const r = extractRectFromDrawing(cmds);
    if (r) {
      const k = (vclip.scale ?? 1) > 1 ? Math.pow(2, (vclip.scale ?? 1) - 1) : 1;
      const x1 = Math.min(r[0], r[2]) / k;
      const y1 = Math.min(r[1], r[3]) / k;
      const x2 = Math.max(r[0], r[2]) / k;
      const y2 = Math.max(r[1], r[3]) / k;
      const w = x2 - x1;
      const h = y2 - y1;
      if (w <= 0 || h <= 0) return null;
      if (w <= 1.05 || h <= 1.05) {
        return { x1, y1, x2, y2, isVertical: w <= 1.05 || w <= h };
      }
    }
  }

  return null;
}

function getStripClip(line: PreparedLine): StripClip | null {
  if (stripClipCache.has(line)) return stripClipCache.get(line)!;
  const clip = extractStripClip(line);
  stripClipCache.set(line, clip);
  return clip;
}

const visualKeyCache = new WeakMap<PreparedLine, string>();

function getVisualKey(line: PreparedLine, styles: Map<string, AssStyle>): string {
  let key = visualKeyCache.get(line);
  if (key !== undefined) return key;

  const lt = line.event.lineTags;
  const p = lt.pos ? `${Math.round(lt.pos[0] * 10) / 10},${Math.round(lt.pos[1] * 10) / 10}` : '';
  const org = lt.org ? `${Math.round(lt.org[0] * 10) / 10},${Math.round(lt.org[1] * 10) / 10}` : '';
  const move = lt.move ? lt.move.join(',') : '';
  const fad = lt.fad ? lt.fad.join(',') : '';
  const fade = lt.fade ? lt.fade.join(',') : '';

  const timing = `${msOf(line.event.start)}_${msOf(line.event.end)}`;

  let fragsStr = '';
  for (let i = 0; i < line.event.fragments.length; i++) {
    const f = line.event.fragments[i];
    fragsStr += `${f.drawingScale}|${f.text}|${f.drawing ? f.drawing.length : 0};`;
  }

  const states = evalStates(line, 0, styles);
  let statesStr = '';
  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    statesStr += `${s.c1},${s.c2},${s.c3},${s.c4}|${s.a1},${s.a2},${s.a3},${s.a4}|` +
      `${Math.round(s.frx * 100) / 100},${Math.round(s.fry * 100) / 100},${Math.round(s.frz * 100) / 100}|` +
      `${Math.round(s.fscx * 100) / 100},${Math.round(s.fscy * 100) / 100}|` +
      `${Math.round(s.fax * 1000) / 1000},${Math.round(s.fay * 1000) / 1000}|` +
      `${s.fn},${s.fs},${s.b ? 1 : 0},${s.i ? 1 : 0}|${s.xbord},${s.ybord};`;
  }

  key = `${line.event.layer}|${line.style.name}|${line.an}|${p}|${org}|${move}|${fad}|${fade}|${timing}|${fragsStr}|${statesStr}`;
  visualKeyCache.set(line, key);
  return key;
}

function flushCluster(
  cluster: { rect: [number, number, number, number]; lines: PreparedLine[] },
  out: PreparedLine[],
): void {
  if (cluster.lines.length === 1) {
    out.push(cluster.lines[0]);
    return;
  }
  const base = cluster.lines[0];
  const last = cluster.lines[cluster.lines.length - 1];
  const coalescedId = `coalesced:${base.event.id}:${last.event.id}:${cluster.lines.length}`;
  const coalescedLine: PreparedLine = {
    ...base,
    event: {
      ...base.event,
      id: coalescedId,
      lineTags: {
        ...base.event.lineTags,
        clip: {
          inverse: false,
          rect: [cluster.rect[0], cluster.rect[1], cluster.rect[2], cluster.rect[3]],
        },
        vclip: undefined,
      },
    },
    clipTransitions: [],
  };
  out.push(coalescedLine);
}

function coalesceStripLines(lines: readonly PreparedLine[], styles: Map<string, AssStyle>): PreparedLine[] {
  if (lines.length <= 1) return lines.slice();

  const nonStrip: PreparedLine[] = [];
  const stripCandidates: Array<{ line: PreparedLine; clip: StripClip }> = [];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const clip = getStripClip(l);
    if (clip) {
      stripCandidates.push({ line: l, clip });
    } else {
      nonStrip.push(l);
    }
  }

  if (stripCandidates.length <= 1) return lines.slice();

  const groups = new Map<string, Array<{ line: PreparedLine; clip: StripClip }>>();
  for (let i = 0; i < stripCandidates.length; i++) {
    const c = stripCandidates[i];
    const key = getVisualKey(c.line, styles);
    let g = groups.get(key);
    if (!g) {
      g = [];
      groups.set(key, g);
    }
    g.push(c);
  }

  const coalescedStrips: PreparedLine[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      coalescedStrips.push(group[0].line);
      continue;
    }

    let verticalCount = 0;
    for (let i = 0; i < group.length; i++) {
      if (group[i].clip.isVertical) verticalCount++;
    }
    const isVertical = verticalCount >= group.length / 2;

    if (isVertical) {
      const spanGroups = new Map<string, Array<{ line: PreparedLine; clip: StripClip }>>();
      for (let i = 0; i < group.length; i++) {
        const item = group[i];
        const spanKey = `${Math.round(item.clip.y1 * 10) / 10}_${Math.round(item.clip.y2 * 10) / 10}`;
        let sg = spanGroups.get(spanKey);
        if (!sg) {
          sg = [];
          spanGroups.set(spanKey, sg);
        }
        sg.push(item);
      }

      for (const spanItems of spanGroups.values()) {
        spanItems.sort((a, b) => a.clip.x1 - b.clip.x1);

        let currentCluster: {
          rect: [number, number, number, number];
          lines: PreparedLine[];
        } | null = null;

        for (let i = 0; i < spanItems.length; i++) {
          const item = spanItems[i];
          if (!currentCluster) {
            currentCluster = {
              rect: [item.clip.x1, item.clip.y1, item.clip.x2, item.clip.y2],
              lines: [item.line],
            };
            continue;
          }

          if (item.clip.x1 <= currentCluster.rect[2] + 1.05 && item.clip.x2 >= currentCluster.rect[2] - 0.05) {
            currentCluster.rect[2] = Math.max(currentCluster.rect[2], item.clip.x2);
            currentCluster.rect[0] = Math.min(currentCluster.rect[0], item.clip.x1);
            currentCluster.lines.push(item.line);
          } else {
            flushCluster(currentCluster, coalescedStrips);
            currentCluster = {
              rect: [item.clip.x1, item.clip.y1, item.clip.x2, item.clip.y2],
              lines: [item.line],
            };
          }
        }
        if (currentCluster) {
          flushCluster(currentCluster, coalescedStrips);
        }
      }
    } else {
      const spanGroups = new Map<string, Array<{ line: PreparedLine; clip: StripClip }>>();
      for (let i = 0; i < group.length; i++) {
        const item = group[i];
        const spanKey = `${Math.round(item.clip.x1 * 10) / 10}_${Math.round(item.clip.x2 * 10) / 10}`;
        let sg = spanGroups.get(spanKey);
        if (!sg) {
          sg = [];
          spanGroups.set(spanKey, sg);
        }
        sg.push(item);
      }

      for (const spanItems of spanGroups.values()) {
        spanItems.sort((a, b) => a.clip.y1 - b.clip.y1);

        let currentCluster: {
          rect: [number, number, number, number];
          lines: PreparedLine[];
        } | null = null;

        for (let i = 0; i < spanItems.length; i++) {
          const item = spanItems[i];
          if (!currentCluster) {
            currentCluster = {
              rect: [item.clip.x1, item.clip.y1, item.clip.x2, item.clip.y2],
              lines: [item.line],
            };
            continue;
          }

          if (item.clip.y1 <= currentCluster.rect[3] + 1.05 && item.clip.y2 >= currentCluster.rect[3] - 0.05) {
            currentCluster.rect[3] = Math.max(currentCluster.rect[3], item.clip.y2);
            currentCluster.rect[1] = Math.min(currentCluster.rect[1], item.clip.y1);
            currentCluster.lines.push(item.line);
          } else {
            flushCluster(currentCluster, coalescedStrips);
            currentCluster = {
              rect: [item.clip.x1, item.clip.y1, item.clip.x2, item.clip.y2],
              lines: [item.line],
            };
          }
        }
        if (currentCluster) {
          flushCluster(currentCluster, coalescedStrips);
        }
      }
    }
  }

  const combined = [...nonStrip, ...coalescedStrips];
  combined.sort((a, b) => a.event.layer - b.event.layer || a.event.index - b.event.index);
  return combined;
}

export const isStripClip = (line: PreparedLine): boolean => {
  return getStripClip(line) !== null;
};

export const isVectorDrawing = (line: PreparedLine): boolean => {
  if (line.event.lineTags.vclip?.drawing) return true;
  return line.event.fragments.some((f) => f.drawingScale > 0 || !!f.drawing);
};

export const hasActualText = (line: PreparedLine): boolean => {
  return line.event.fragments.some((f) => f.drawingScale === 0 && f.text.trim().length > 0);
};

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
  private renderEpoch = 0;
  private pendingReadyEpoch = -1;
  private pendingReadyGeneration = -1;
  private diagnosticsEnabled = false;
  private diagnosticSample: SceneDiagnosticsSample | null = null;
  private logger: RenderLogger | null = null;
  private markerMediaTime = 0;
  private markerGeneration = -1;
  private markerEpoch = -1;

  constructor(
    private readonly overlay: Overlay,
    mode: () => RenderMode = () => 'auto',
    cacheBytes = 96 << 20,
    workers: () => SpriteWorkers = () => 'auto',
    loadShedding: () => 'auto' | 'off' = () => 'auto',
    private maxDomBudget = MAX_DOM_BUDGET,
  ) {
    this.canvas = new CanvasPath(overlay, mode, cacheBytes, loadShedding);
    this.ahead = new Lookahead(this.canvas, () => ({
      startingIn: (a, b) => this.timeline.startingIn(a, b), visibleAt: (t) => this.timeline.visibleAt(t), startMs: this.startOf, covers: this.covers,
    }), workers);
  }

  setDomBudget(budget: number): void { this.maxDomBudget = Math.max(1, budget); }
  get domBudget(): number { return this.maxDomBudget; }

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
  set onReady(fn: (epoch: number, generation: number) => void) { this.ahead.onReady = () => fn(this.pendingReadyEpoch, this.pendingReadyGeneration); }

  /** The held render epoch whose sprites are still being built, or -1 when no frame is waiting. */
  get readyEpoch(): number { return this.pendingReadyEpoch; }

  /** Renderer request generation associated with the held frame, or -1 when no frame is waiting. */
  get readyGeneration(): number { return this.pendingReadyGeneration; }

  /** Ms the playhead would have to wait for every planned sprite to be built before its frame; 0 = playing on is safe. */
  deficit(t: number): number { return this.ahead.deficit(t); }

  /** Subtitle ms until which every planned sprite is built and available. */
  readyUntil(): number { return this.ahead.readyUntil(); }

  /** Sprite workers are running (page-thread building alone is too slow to buy time by holding the picture). */
  get buffers(): boolean { return this.ahead.hasWorkers; }

  /** Explicit seeks cancel warming even for jumps smaller than the playback discontinuity threshold. */
  cancelWarm(): void { this.ahead.clear(); }

  /** How far ahead live preparation plans (subtitle milliseconds). */
  setWarmRange(ms: number): void { this.ahead.setRange(ms); }

  /** Scenes with more pending lines than this are force-prepared (temperature). */
  setTemperature(n: number): void { this.ahead.setTemperature(n); }

  /** Everything currently planned that is not built yet. */
  warmPending(): number { return this.ahead.stats().pending + this.ahead.stats().planQueued; }

  /** Whether the frame at `tMs` can be drawn from already built sprites and source events. */
  readyAt(tMs: number): boolean {
    return (!this.covers || this.covers(tMs)) && (this.ahead.deficit(tMs) === 0 || this.ahead.readyUntil() >= tMs);
  }

  /** Work is planned and nothing is working on it: a frame waiting for it would wait forever. */
  get stuck(): boolean { return this.ahead.stuck; }

  setDiagnostics(enabled: boolean): void {
    this.diagnosticsEnabled = enabled;
    this.canvas.setProfiling(enabled);
    if (!enabled) this.diagnosticSample = null;
  }

  get diagnostics(): SceneDiagnosticsSample | null { return this.diagnosticSample; }

  setLogger(logger: RenderLogger | null): void {
    this.logger = logger;
    this.canvas.setMarker(logger ? (item, outcome, start, end) => this.markCanvas(item, outcome, start, end) : null);
  }

  private markCanvas(item: { id: string; index: number }, outcome: CanvasMarkerOutcome, start: number, end: number): void {
    this.logger?.mark({ id: item.id, index: item.index, mediaTime: this.markerMediaTime, generation: this.markerGeneration, epoch: this.markerEpoch, path: 'canvas', start, end, outcome });
  }

  private markDom(line: PreparedLine, start: number, end: number): void {
    this.logger?.mark({ id: line.event.id, index: line.event.index, mediaTime: this.markerMediaTime, generation: this.markerGeneration, epoch: this.markerEpoch, path: 'dom', start, end, outcome: 'rendered' });
  }

  setScript(script: ParsedScript | null, preserveSprites = false): void {
    this.clear(preserveSprites);
    this.cache.clear();
    this.covers = null;
    this.timeline = script
      ? new Timeline(script.events.map((e) => prepareLine(e, script.styles, script.info)))
      : new Timeline([]);
  }

  /** Windowed script: applies a window change. Returns the newly prepared lines (what the font layer scans). */
  setWindow(events: readonly AssEvent[], added: readonly AssEvent[], removed: readonly number[], script: Pick<ParsedScript, 'styles' | 'info'>): PreparedLine[] {
    this.diagnosticSample = null;
    this.pendingReadyEpoch = -1;
    this.pendingReadyGeneration = -1;
    for (let i = 0; i < removed.length; i++) this.cache.delete(removed[i]);
    const fresh: PreparedLine[] = new Array(added.length);
    for (let i = 0; i < added.length; i++) {
      const l = prepareLine(added[i], script.styles, script.info);
      fresh[i] = l;
      this.cache.set(l.event.index, l);
    }
    const lines: PreparedLine[] = [];
    for (let i = 0; i < events.length; i++) {
      const l = this.cache.get(events[i].index);
      if (l) lines.push(l);
    }
    this.timeline = new Timeline(lines);
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
  render(t: number, env: LineEnv, force: boolean, policy: Policy = 'partial', generation = -1, mediaTime = t / 1000): boolean {
    const epoch = ++this.renderEpoch;
    this.pendingReadyEpoch = policy === 'hold' ? epoch : -1;
    this.pendingReadyGeneration = policy === 'hold' ? generation : -1;
    this.markerMediaTime = mediaTime;
    this.markerGeneration = generation;
    this.markerEpoch = epoch;
    const sceneStart = this.diagnosticsEnabled ? performance.now() : 0;
    this.ahead.begin(t, env);
    let complete = true;
    const all = this.covers && !this.covers(t) ? [] : this.timeline.visibleAt(t);
    const visible = this.hold ? all.filter((l) => !this.hold!.has(l.event.index)) : all;
    const route = this.canvas.route(visible, t);
    const domCandidates = visible.filter((_, i) => !route[i]);
    const domLinesToRender = coalesceStripLines(domCandidates, env.styles);
    const ids = new Set(domLinesToRender.map((l) => l.event.id));
    for (const [id, view] of this.views) {
      if (ids.has(id)) continue;
      view.destroy();
      this.views.delete(id);
      this.placed.delete(id);
    }
    const domStart = this.diagnosticsEnabled ? performance.now() : 0;
    for (let i = 0; i < domLinesToRender.length; i++) {
      this.renderDom(domLinesToRender[i], t, env, force);
    }
    const domMs = this.diagnosticsEnabled && domLinesToRender.length > 0 ? performance.now() - domStart : null;
    this.canvasLines = route.filter(Boolean).length;
    let canvasMs: number | null = null;
    if (this.canvasLines > 0 || this.canvasOn) {
      const t0 = performance.now();
      complete = this.canvas.render(visible.map((line, i) => ({ line, rel: t - this.timeline.startMs(line), canvas: route[i] })), env, policy);
      const canvasElapsed = performance.now() - t0;
      this.canvasOn = this.canvasLines > 0;
      this.ahead.note(t, env, canvasElapsed);
      if (this.diagnosticsEnabled && this.canvasLines > 0) canvasMs = canvasElapsed;
    } else {
      this.canvas.clearProfile();
      this.ahead.note(t, env, null); // No canvas line on screen: the next burst still needs its sprites, so look ahead now and then.
    }
    if (this.diagnosticsEnabled) {
      this.diagnosticSample = {
        sceneMs: performance.now() - sceneStart,
        domMs,
        canvasMs,
        visible,
        route,
        canvas: this.canvasLines > 0 ? this.canvas.canvasProfile : null,
      };
    }
    if (complete) {
      this.pendingReadyEpoch = -1;
      this.pendingReadyGeneration = -1;
    }
    return complete;
  }

  private readonly startOf = (l: PreparedLine): number => this.timeline.startMs(l);

  private renderDom(line: PreparedLine, t: number, env: LineEnv, force: boolean): void {
    const rel = t - this.timeline.startMs(line);
    const existing = this.views.get(line.event.id);
    const started = this.logger ? performance.now() : 0;
    if (existing) {
      existing.update(rel, env, force);
      if (this.logger) this.markDom(line, started, performance.now());
      return;
    }
    const view = new LineView(line);
    this.views.set(line.event.id, view);
    this.overlay.insert(view.root, line.event.layer, line.event.index);
    view.update(rel, env, true);
    if (line.stacks) this.place(view, env, rel);
    if (this.logger) this.markDom(line, started, performance.now());
  }

  /** Collision handling for unpositioned lines (lines already on screen keep their place). */
  private place(view: LineView, env: LineEnv, rel: number): void {
    const measured = view.measure(env.layout, env.bottomInset ?? env.layout.bottomInset ?? 0);
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

  clear(preserveSprites = false): void {
    this.diagnosticSample = null;
    this.pendingReadyEpoch = -1;
    this.pendingReadyGeneration = -1;
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    this.placed.clear();
    this.canvas.clear(preserveSprites);
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
