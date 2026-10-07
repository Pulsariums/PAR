import type { PreparedLine } from '../anim/Prepared';
import type { LineEnv } from '../render/LineView';

import type { CanvasPath } from './CanvasPath';
import { AUTO_LOAD } from './eligibility';
import type { Dropped } from './paint';
import { planLine } from './plan';
import { sampleTimes } from './sprites';

export { sampleTimes };

export interface WarmState {
  /** Events whose sprites are all built. */
  done: Set<string>;
  /** Events partly done: index of the next sample to plan (so a frame never plans the same sample twice). */
  next: Map<string, number>;
}

export const newWarmState = (): WarmState => ({ done: new Set(), next: new Map() });

/** Result of one lookahead slice. */
export interface Warmed {
  /** Sprites built. */
  built: number;
  /** True when the slice ended with work left (budget used up) in the events it was given. */
  more: boolean;
}

/**
 * Lookahead: builds the sprites of events about to start (`upcoming`, in start order) in the time it is given, so the frame they
 * appear in finds them cached. Walks the same plan as drawing (`planLine`), so a warmed key is exactly the key drawn later.
 * Progress is remembered per event: each (event, sample) is planned once however many slices it takes.
 */
export const warmUp = (
  path: CanvasPath, upcoming: readonly PreparedLine[], tMs: number, env: LineEnv, frameMs: number, budgetMs: number, st: WarmState,
  startOf: (l: PreparedLine) => number,
): Warmed => {
  const t0 = performance.now();
  const dropped: Dropped = { blur: 0 };
  const wanted = path.mode() === 'canvas' || path.busy(tMs) || upcomingLoad(path, upcoming) >= AUTO_LOAD;
  if (!wanted) return { built: 0, more: false };
  let built = 0;
  if (st.done.size > 16000) { st.done.clear(); st.next.clear(); }
  for (const line of upcoming) {
    const id = line.event.id;
    if (st.done.has(id) || !path.complexity(line).eligible) continue;
    if (performance.now() - t0 >= budgetMs) return { built, more: true };
    const times = sampleTimes(line, frameMs, startOf(line));
    let i = st.next.get(id) ?? 0;
    for (; i < times.length; i++) {
      if (performance.now() - t0 >= budgetMs) { st.next.set(id, i); return { built, more: true }; }
      const it = planLine(line, times[i], env, path.complexity(line).animated, dropped);
      if (path.cache.peek(it.key) !== undefined) continue;
      path.prebuild(it.key, it.spec);
      built++;
    }
    st.next.delete(id);
    st.done.add(id);
  }
  return { built, more: false };
};

const upcomingLoad = (path: CanvasPath, lines: readonly PreparedLine[]): number => {
  let n = 0;
  for (const l of lines) { const c = path.complexity(l); if (c.eligible) n += c.score; if (n >= AUTO_LOAD) break; }
  return n;
};
