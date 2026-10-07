import type { Series } from './bins';
import type { Burst } from './types';

/**
 * Instants where the number of visible lines jumps. A burst starts on a frame that shows at least `min` more lines than the one before
 * and lasts while the count keeps rising by at least a quarter of that (a thousand particles appear over a few frames, not one).
 * `newKeys` / `cost` are per-frame series of sprites first used on that frame; they are summed from the jump to a few frames past its peak.
 */
export const findBursts = (visible: Series, min: number, fps: number, newKeys: Series, cost: Series): Burst[] => {
  const out: Burst[] = [];
  const keep = Math.max(1, min / 4);
  let k = 1;
  while (k < visible.length) {
    if (visible.get(k) - visible.get(k - 1) < min) { k++; continue; }
    const before = visible.get(k - 1);
    let end = k, peak = visible.get(k), last = k;
    for (let j = k + 1; j < visible.length; j++) {
      if (visible.get(j) - visible.get(j - 1) >= keep) last = j;
      if (visible.get(j) > peak) { peak = visible.get(j); end = j; }
      if (j - last > 2) break;
    }
    const to = end + 6;
    out.push({ at: Math.round((k / fps) * 1000) / 1000, before, peak, newKeys: newKeys.sum(k, to), buildMs: Math.round(cost.sum(k, to) * 10) / 10 });
    k = to + 1;
  }
  return out;
};
