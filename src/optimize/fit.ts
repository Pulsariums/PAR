import type { OptEvent } from './events';

/** `value(t) = v0 + slope * (t - t0)` for every fitted number of a segment. */
export interface Line { t0: number; v0: number; slope: number }

export interface Segment {
  /** First and last event of the run (indexes into the chain). a === b: left as it is. */
  a: number;
  b: number;
  lines: Line[] | null;
}

const worst = (pts: ReadonlyArray<{ t: number; e: OptEvent }>, s: number, l: Line): number => {
  let w = 0;
  for (const p of pts) w = Math.max(w, Math.abs(l.v0 + l.slope * (p.t - l.t0) - p.e.vals[s]));
  return w;
};

/**
 * One straight line per fitted number through the frames of `a..b`, or null when some number is not a line within its tolerance.
 * Two candidates per number: the chord through the first and last frame, and the least-squares line (frame instants are whole
 * milliseconds, so values that are exactly linear in the frame number are a little off a chord at fast motion); the better one counts.
 */
const fitRun = (evs: readonly OptEvent[], frames: readonly number[][], a: number, b: number, tol: (slot: number, v: number) => number): Line[] | null => {
  const pts: Array<{ t: number; e: OptEvent }> = [];
  for (let i = a; i <= b; i++) for (const t of frames[i]) pts.push({ t, e: evs[i] });
  if (pts.length < 2 || pts[pts.length - 1].t <= pts[0].t) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const t0 = first.t;
  const meanT = pts.reduce((n, p) => n + p.t, 0) / pts.length;
  const varT = pts.reduce((n, p) => n + (p.t - meanT) ** 2, 0);
  const lines: Line[] = [];
  for (let s = 0; s < first.e.vals.length; s++) {
    const v0 = first.e.vals[s];
    const chord: Line = { t0, v0, slope: (last.e.vals[s] - v0) / (last.t - t0) };
    const meanV = pts.reduce((n, p) => n + p.e.vals[s], 0) / pts.length;
    const slope = varT > 0 ? pts.reduce((n, p) => n + (p.t - meanT) * (p.e.vals[s] - meanV), 0) / varT : 0;
    const lsq: Line = { t0, v0: meanV + slope * (t0 - meanT), slope };
    const best = worst(pts, s, lsq) < worst(pts, s, chord) ? lsq : chord;
    if (worst(pts, s, best) > tol(s, v0)) return null;
    lines.push(best);
  }
  return lines;
};

/**
 * Cuts a chain into the longest runs of consecutive events that one straight line per number reproduces on every frame that shows them
 * (greedy: extend while it still fits). An event that shows on no frame at the target rate puts no constraint on the line, so it is
 * absorbed by the run around it (centisecond rounding of the times leaves such events in files made for another rate or phase).
 */
export const segment = (evs: readonly OptEvent[], frames: readonly number[][], tol: (slot: number, v: number) => number): Segment[] => {
  const out: Segment[] = [];
  let i = 0;
  while (i < evs.length) {
    let best: Segment | null = null;
    for (let j = i + 1; j < evs.length; j++) {
      const lines = fitRun(evs, frames, i, j, tol);
      if (!lines) break;
      best = { a: i, b: j, lines };
    }
    if (best) { out.push(best); i = best.b + 1; } else { out.push({ a: i, b: i, lines: null }); i++; }
  }
  return out;
};
