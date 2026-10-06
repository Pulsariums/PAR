import type { PreparedLine } from '../anim/Prepared';

/** Visible-line queries in O(log n + k): lines sorted by start, scanned back by the longest duration. */
export class Timeline {
  private readonly lines: PreparedLine[];
  private readonly starts: number[];
  private readonly maxDuration: number;

  constructor(lines: PreparedLine[]) {
    this.lines = [...lines].sort((a, b) => a.event.start - b.event.start || a.event.index - b.event.index);
    this.starts = this.lines.map((l) => l.event.start);
    this.maxDuration = this.lines.reduce((m, l) => Math.max(m, l.event.end - l.event.start), 0);
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

  /** Lines with `start <= t < end` (seconds), ordered by (layer, file order). */
  visibleAt(t: number): PreparedLine[] {
    const out: PreparedLine[] = [];
    const end = this.upper(t);
    const begin = this.upper(t - this.maxDuration - 1e-9);
    for (let i = Math.max(0, begin - 1); i < end; i++) {
      const l = this.lines[i];
      if (l.event.start <= t && t < l.event.end) out.push(l);
    }
    return out.sort((a, b) => a.event.layer - b.event.layer || a.event.index - b.event.index);
  }
}
