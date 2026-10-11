import type { PreparedLine } from '../anim/Prepared';

import { msOf } from './time';

/**
 * Visible-line queries in O(log n + k) on INTEGER milliseconds (see `time.ts`): visible <=> startMs <= t < endMs.
 * Lines are sorted by start and scanned back by the longest duration. A line with end <= start is never visible.
 */
export class Timeline {
  private readonly lines: PreparedLine[];
  private readonly starts: number[];
  private readonly ends: number[];
  private readonly maxDuration: number;
  private lastT = -1;
  private lastOut: PreparedLine[] = [];

  constructor(lines: readonly PreparedLine[]) {
    const n = lines.length;
    const keyed = new Array<{ l: PreparedLine; s: number; e: number }>(n);
    for (let i = 0; i < n; i++) {
      const l = lines[i];
      keyed[i] = { l, s: msOf(l.event.start), e: msOf(l.event.end) };
    }
    keyed.sort((a, b) => a.s - b.s || a.l.event.index - b.l.event.index);
    const ls = new Array<PreparedLine>(n);
    const starts = new Array<number>(n);
    const ends = new Array<number>(n);
    let maxDuration = 0;
    for (let i = 0; i < n; i++) {
      const k = keyed[i];
      ls[i] = k.l;
      starts[i] = k.s;
      ends[i] = k.e;
      const dur = k.e - k.s;
      if (dur > maxDuration) maxDuration = dur;
    }
    this.lines = ls;
    this.starts = starts;
    this.ends = ends;
    this.maxDuration = maxDuration;
  }

  /** All lines, sorted by start. */
  get all(): readonly PreparedLine[] {
    return this.lines;
  }

  get size(): number {
    return this.lines.length;
  }

  /** First index with start > t. */
  private upper(t: number): number {
    let lo = 0;
    let hi = this.starts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.starts[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Start of the line in integer ms (what `visibleAt` compares). */
  startMs(l: PreparedLine): number {
    return msOf(l.event.start);
  }

  /** Lines starting in (`aMs`, `bMs`], in start order (what is about to appear). */
  startingIn(aMs: number, bMs: number): PreparedLine[] {
    return this.lines.slice(this.upper(aMs), this.upper(bMs));
  }

  /** Lines with `startMs <= tMs < endMs`, ordered by (layer, file order). `tMs` is an integer. */
  visibleAt(tMs: number): PreparedLine[] {
    if (tMs === this.lastT) return this.lastOut;
    const out: PreparedLine[] = [];
    const end = this.upper(tMs);
    const begin = this.upper(tMs - this.maxDuration);
    for (let i = Math.max(0, begin - 1); i < end; i++) {
      if (this.starts[i] <= tMs && tMs < this.ends[i]) out.push(this.lines[i]);
    }
    out.sort((a, b) => a.event.layer - b.event.layer || a.event.index - b.event.index);
    this.lastT = tMs;
    this.lastOut = out;
    return out;
  }
}
