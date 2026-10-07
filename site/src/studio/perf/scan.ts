import type { SubtitleSource } from '../../../../src/index';

export interface Moment { t: number; lines: number }

export interface ScanOptions {
  /** Window read per step (s). */
  step?: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

/** Moments of the same stretch are one: the best of every `GAP` seconds is kept. */
const GAP = 10;

/**
 * Finds the busiest moments of a subtitle by reading it window by window (through the source, so big files stay in their Worker) and counting
 * how many events are on screen at a few instants per window. Returns up to `count` moments, busiest first, at least `GAP` s apart.
 */
export const busiest = async (source: SubtitleSource, count: number, opt: ScanOptions = {}): Promise<Moment[]> => {
  const step = opt.step ?? 4;
  const probes = 4;
  const found: Moment[] = [];
  const end = Math.max(step, source.duration);
  for (let t = 0; t < end; t += step) {
    if (opt.signal?.aborted) break;
    const events = await source.readWindow(t, t + step, opt.signal);
    for (let k = 0; k < probes; k++) {
      const x = t + (k * step) / probes;
      let n = 0;
      for (const e of events) if (e.start <= x && x < e.end) n++;
      if (n > 0) found.push({ t: Math.round(x * 100) / 100, lines: n });
    }
    opt.onProgress?.(Math.min(1, (t + step) / end));
  }
  const out: Moment[] = [];
  for (const m of found.sort((a, b) => b.lines - a.lines)) {
    if (out.length >= count) break;
    if (out.every((o) => Math.abs(o.t - m.t) >= GAP)) out.push(m);
  }
  return out;
};
