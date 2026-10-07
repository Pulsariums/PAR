import type { PreparedLine } from '../../anim/Prepared';
import type { LineEnv } from '../../render/LineView';
import type { CanvasPath } from '../CanvasPath';
import { AUTO_LOAD } from '../eligibility';
import { spriteRequests, type SpriteReq } from '../sprites';

/** What the plan reads of the script's timeline (`Timeline` plus whether a time is loaded in a windowed script). */
export interface Lines {
  startingIn(aMs: number, bMs: number): PreparedLine[];
  visibleAt(tMs: number): PreparedLine[];
  startMs(l: PreparedLine): number;
  covers: ((tMs: number) => boolean) | null;
}

const CHUNK_MS = 500;

/** Same rule the old look-ahead used: forced canvas, canvas lines on screen lately, or a chunk heavy enough that `auto` will route it to the canvas. */
const wanted = (path: CanvasPath, t: number, chunk: readonly PreparedLine[]): boolean => {
  if (path.mode() === 'canvas' || path.busy(t)) return true;
  let load = 0;
  for (const l of chunk) {
    const c = path.complexity(l);
    if (c.eligible && (load += c.score) >= AUTO_LOAD) return true;
  }
  return false;
};

/**
 * Walks the script forward in time chunks and yields the sprites its events need (`spriteRequests`, the derivation drawing and
 * the analyzer use). Lines already on screen at the restart come first, then everything that starts after. Resumable: a slice that
 * runs out of time continues where it stopped.
 */
export class Expander {
  /** Everything starting up to here has been read (its sprites went to `sink`, or it was skipped as unwanted). */
  frontier = NaN;
  private pending: PreparedLine[] = [];
  private pi = 0;
  private end = NaN;
  private wantedChunk = false;

  restart(t: number, lines: Lines): void {
    this.frontier = t;
    this.pending = lines.visibleAt(t);
    this.pi = 0;
    this.end = t;
    this.wantedChunk = true;
  }

  reset(): void {
    this.frontier = NaN;
    this.pending = [];
    this.pi = 0;
    this.end = NaN;
  }

  /** Reads lines until `until` (ms), `room()` says stop, or `left()` runs out. True when it could go on. `blocked`: the next chunk is not loaded (windowed script). */
  run(path: CanvasPath, t: number, env: LineEnv, frameMs: number, lines: Lines, until: number, room: () => boolean, left: () => number, sink: (r: SpriteReq) => void): { more: boolean; blocked: boolean } {
    for (;;) {
      while (this.pi < this.pending.length) {
        if (left() <= 0) return { more: true, blocked: false };
        const line = this.pending[this.pi++];
        const c = this.wantedChunk ? path.complexity(line) : null;
        if (c?.eligible) for (const r of spriteRequests(line, env, c.animated, frameMs, lines.startMs(line), undefined, true)) sink(r);
      }
      this.pending = [];
      this.pi = 0;
      if (Number.isFinite(this.end)) { this.frontier = this.end; this.end = NaN; }
      if (this.frontier >= until || !room()) return { more: false, blocked: false };
      if (left() <= 0) return { more: true, blocked: false };
      const a = this.frontier, b = Math.min(a + CHUNK_MS, until);
      if (lines.covers && !lines.covers(b - 1)) return { more: false, blocked: true };
      this.pending = lines.startingIn(a, b);
      this.end = b;
      this.wantedChunk = wanted(path, t, this.pending);
    }
  }
}
