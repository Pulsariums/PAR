import type { PreparedLine } from '../../anim/Prepared';
import type { LineEnv } from '../../render/LineView';
import type { CanvasPath } from '../CanvasPath';
import { AUTO_LOAD } from '../eligibility';
import { spriteRequestSamples, type SpriteReq } from '../sprites';

/** What the plan reads of the script's timeline (`Timeline` plus whether a time is loaded in a windowed script). */
export interface Lines {
  startingIn(aMs: number, bMs: number): PreparedLine[];
  visibleAt(tMs: number): PreparedLine[];
  startMs(l: PreparedLine): number;
  covers: ((tMs: number) => boolean) | null;
}

const CHUNK_MS = 500;
/** Per slice, including duplicate samples and cheap eligibility checks. */
export const MAX_SLICE_REQUESTS = 128;
/** Dense scenes are prepared before their first visible frame (default temperature; `setTemperature` adjusts it). */
export const PREPARE_LINE_THRESHOLD = 50;

/** Walks loaded windows, using cheap eligibility scores before deriving exact, resumable sprite requests. */
export class Expander {
  frontier = NaN;
  /** Scenes whose pending line count exceeds this are prepared even when the canvas is idle. */
  temperature = PREPARE_LINE_THRESHOLD;
  /** Current chunk's boundary, also while admission pauses at a queue/time bound. */
  get pendingUntil(): number { return Number.isFinite(this.end) ? this.end : this.frontier; }
  private pending: PreparedLine[] = [];
  private pi = 0;
  private end = NaN;
  private from = 0;
  private wantedChunk = false;
  private deciding = false;
  private score = 0;
  private requests: Generator<SpriteReq> | null = null;

  restart(t: number, lines: Lines): void {
    this.frontier = t;
    this.pending = lines.visibleAt(t);
    this.pi = 0;
    this.end = t;
    this.from = t;
    this.wantedChunk = true;
    this.deciding = false;
    this.requests = null;
  }

  reset(): void {
    this.frontier = NaN;
    this.pending = [];
    this.pi = 0;
    this.end = NaN;
    this.requests = null;
    this.deciding = false;
  }

  /** Stops between samples, not between full events: queue, time and request bounds all apply to dense animations. */
  run(path: CanvasPath, t: number, env: LineEnv, frameMs: number, lines: Lines, until: number, room: () => boolean, left: () => number, sink: (r: SpriteReq) => void): { more: boolean; blocked: boolean } {
    let work = 0;
    for (;;) {
      while (this.deciding && this.pi < this.pending.length) {
        if (left() <= 0 || work >= MAX_SLICE_REQUESTS) return { more: true, blocked: false };
        const c = path.complexity(this.pending[this.pi++]);
        work++;
        if (c.eligible) this.score += c.score;
        if (this.score >= AUTO_LOAD) { this.wantedChunk = true; break; }
      }
      if (this.deciding) { this.deciding = false; this.pi = 0; }
      while (this.requests || this.pi < this.pending.length) {
        if (left() <= 0 || work >= MAX_SLICE_REQUESTS) return { more: true, blocked: false };
        if (!room()) return { more: false, blocked: false };
        if (this.requests) {
          const r = this.requests.next();
          if (r.done) this.requests = null;
          else { work++; if (r.value.until >= t) sink(r.value); }
          continue;
        }
        const line = this.pending[this.pi++];
        work++;
        const c = this.wantedChunk ? path.complexity(line) : null;
        if (c?.eligible) this.requests = spriteRequestSamples(line, env, c.animated, frameMs, lines.startMs(line), undefined, true, [Math.max(t, this.from), Math.max(this.end, t + frameMs)]);
      }
      this.pending = [];
      this.pi = 0;
      if (Number.isFinite(this.end)) { this.frontier = this.end; this.end = NaN; }
      if (this.frontier >= until || !room()) return { more: false, blocked: false };
      if (left() <= 0 || work >= MAX_SLICE_REQUESTS) return { more: true, blocked: false };
      const a = this.frontier, b = Math.min(a + CHUNK_MS, until);
      if (lines.covers && !lines.covers(b)) return { more: false, blocked: true };
      // Survivors matter: staggered starts can form a dense scene, and animated survivors
      // need fresh variants as the rolling window advances.
      this.pending = [...new Set([...lines.visibleAt(a), ...lines.startingIn(a, b)])];
      this.from = a;
      this.end = b;
      this.wantedChunk = this.pending.length > this.temperature || path.mode() === 'canvas' || path.busy(t);
      this.deciding = !this.wantedChunk;
      this.score = 0;
    }
  }
}
