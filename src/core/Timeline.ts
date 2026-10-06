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

  constructor(lines: readonly PreparedLine[]) {
    const keyed = lines.map((l) => ({ l, s: msOf(l.event.start), e: msOf(l.event.end) }));
    keyed.sort((a, b) => a.s - b.s || a.l.event.index - b.l.event.index);
    this.lines = keyed.map((k) => k.l);
    this.starts = keyed.map((k) => k.s);
    this.ends = keyed.map((k) => k.e);
    this.maxDuration = keyed.reduce((m, k) => Math.max(m, k.e - k.s), 0);
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

  /** Lines with `startMs <= tMs < endMs`, ordered by (layer, file order). `tMs` is an integer. */
  visibleAt(tMs: number): PreparedLine[] {
    const out: PreparedLine[] = [];
    const end = this.upper(tMs);
    const begin = this.upper(tMs - this.maxDuration);
    for (let i = Math.max(0, begin - 1); i < end; i++) {
      if (this.starts[i] <= tMs && tMs < this.ends[i]) out.push(this.lines[i]);
    }
    return out.sort((a, b) => a.event.layer - b.event.layer || a.event.index - b.event.index);
  }
}
