import type { PreparedLine } from '../../anim/Prepared';
import type { LineEnv } from '../../render/LineView';
import type { CanvasPath } from '../CanvasPath';
import { AUTO_LOAD } from '../eligibility';
import { MAX_SAMPLES, spriteRequestSamples, type SpriteReq } from '../sprites';

/** What the plan reads of the script's timeline (`Timeline` plus whether a time is loaded in a windowed script). */
export interface Lines {
  startingIn(aMs: number, bMs: number): PreparedLine[];
  visibleAt(tMs: number): PreparedLine[];
  startMs(l: PreparedLine): number;
  covers: ((tMs: number) => boolean) | null;
}

const CHUNK_MS = 500;
/** Minimum requests one slice is worth dispatching to the builders (and the floor the time budget is calibrated against). */
export const MAX_SLICE_REQUESTS = 480;
/** Wall ms a slice's expansion may take before time cuts it off (measured: ~23 µs per derived request on the bench machine). */
export const EXPAND_MS = 16;
/** Share of the slice budget the expansion may claim even when it is above `EXPAND_MS`. */
export const PLAN_SHARE = 0.6;
/** Hard request bound per slice: only reachable with a frozen clock; keeps one slice from walking an unbounded horizon. */
export const EXPAND_MAX_REQUESTS = 4096;
/** Dense scenes are prepared before their first visible frame (default temperature; `setTemperature` adjusts it). */
export const PREPARE_LINE_THRESHOLD = 50;

/**
 * Walks loaded windows, using cheap eligibility scores before deriving exact, resumable sprite requests.
 *
 * The slice bound is time (`left`), not a request count: at ~23 µs per derived request a 4 ms count slice capped enumeration at
 * ~24 pumps/s * 128 = 3,072 req/s while dense animated endings demand several times that, leaving the builders starved at 23 % of
 * their real throughput. On first touch of a line its remaining frame-grid variants are enumerated in one admission (up to the plan
 * horizon `until`), and the expander remembers how far each line was walked so survivors re-enter only for the new sliver of time.
 */
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
  /** Absolute ms up to which each line's variants have been enumerated (whole-life lines are not walked twice). */
  private readonly walked = new Map<PreparedLine, number>();
  private walkLine: PreparedLine | null = null;
  private walkTo = NaN;
  private walkFrom = NaN;

  restart(t: number, lines: Lines): void {
    this.frontier = t;
    this.pending = lines.visibleAt(t);
    this.pi = 0;
    this.end = t;
    this.from = t;
    this.wantedChunk = true;
    this.deciding = false;
    this.requests = null;
    this.walked.clear();
    [this.walkLine, this.walkTo, this.walkFrom] = [null, NaN, NaN];
  }

  reset(): void {
    this.frontier = NaN;
    this.pending = [];
    this.pi = 0;
    this.end = NaN;
    this.requests = null;
    this.deciding = false;
    this.walked.clear();
    [this.walkLine, this.walkTo, this.walkFrom] = [null, NaN, NaN];
  }

  /** Stops between samples, not between full events: queue, time and the request bound all apply to dense animations. */
  run(path: CanvasPath, t: number, env: LineEnv, frameMs: number, lines: Lines, until: number, room: () => boolean, left: () => number, sink: (r: SpriteReq) => void): { more: boolean; blocked: boolean } {
    let work = 0;
    const bounded = (): boolean => left() <= 0 || work >= EXPAND_MAX_REQUESTS;
    for (;;) {
      while (this.deciding && this.pi < this.pending.length) {
        if (bounded()) return { more: true, blocked: false };
        const c = path.complexity(this.pending[this.pi++]);
        work++;
        if (c.eligible) this.score += c.score;
        if (this.score >= AUTO_LOAD) { this.wantedChunk = true; break; }
      }
      if (this.deciding) { this.deciding = false; this.pi = 0; }
      while (this.requests || this.pi < this.pending.length) {
        if (bounded()) return { more: true, blocked: false };
        if (!room()) return { more: false, blocked: false };
        if (this.requests) {
          const r = this.requests.next();
          if (r.done) {
            this.requests = null;
            // Only up to the sample cap counts as walked: a later slice resumes the rest of a longer line (as the old
            // per-chunk walk did), so no frame ever skips prewarming because one admission stopped at MAX_SAMPLES.
            if (this.walkLine) this.walked.set(this.walkLine, Math.min(this.walkTo, this.walkFrom + (MAX_SAMPLES + 1) * frameMs));
            this.walkLine = null;
          } else { work++; if (r.value.until >= t) sink(r.value); }
          continue;
        }
        const line = this.pending[this.pi++];
        work++;
        const c = this.wantedChunk ? path.complexity(line) : null;
        if (!c?.eligible) continue;
        // All remaining variants up to the plan horizon, from wherever this line was last walked (a seek clears `walked`).
        const start = lines.startMs(line);
        const to = Math.max(until, this.end, t + frameMs);
        const fromR = Math.max(t, this.from, this.walked.get(line) ?? start);
        if (fromR >= to) continue; // already walked to (or past) this slice's horizon
        this.walkLine = line;
        [this.walkTo, this.walkFrom] = [to, fromR];
        this.requests = spriteRequestSamples(line, env, c.animated, frameMs, start, undefined, true, [fromR, to]);
      }
      this.pending = [];
      this.pi = 0;
      if (Number.isFinite(this.end)) { this.frontier = this.end; this.end = NaN; }
      if (this.frontier >= until || !room()) return { more: false, blocked: false };
      if (bounded()) return { more: true, blocked: false };
      const a = this.frontier, b = Math.min(a + CHUNK_MS, until);
      if (lines.covers && !lines.covers(b)) return { more: false, blocked: true };
      // Survivors matter: staggered starts can form a dense scene, and animated survivors
      // need fresh variants as the rolling window advances (the sliver after `walked`, not the whole line again).
      this.pending = [...new Set([...lines.visibleAt(a), ...lines.startingIn(a, b)])];
      this.from = a;
      this.end = b;
      this.wantedChunk = this.pending.length > this.temperature || path.mode() === 'canvas' || path.busy(t);
      this.deciding = !this.wantedChunk;
      this.score = 0;
    }
  }
}
