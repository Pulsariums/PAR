import type { PreparedLine } from '../anim/Prepared';
import type { LineEnv } from '../render/LineView';

import type { CanvasPath } from './CanvasPath';
import { AUTO_LOAD } from './eligibility';
import type { Dropped } from './paint';
import { planLine } from './plan';

/** Most frames of one event that are sampled for sprites. */
const MAX_SAMPLES = 24;

/** Times (ms since line start) to sample so every sprite variant the event will need is seen: one for static events, a frame grid otherwise. */
export const sampleTimes = (line: PreparedLine, frameMs: number): number[] => {
  if (!line.animated) return [0];
  const step = Math.max(frameMs, line.durationMs / MAX_SAMPLES);
  const out: number[] = [];
  for (let t = 0; t < line.durationMs && out.length < MAX_SAMPLES; t += step) out.push(Math.round(t));
  return out;
};

export interface WarmState {
  done: Set<string>;
}

/**
 * Lookahead: builds the sprites of events about to start (`upcoming`, in start order) while the frame has time left, so the frame
 * they appear in finds them cached. Walks the same plan as drawing (`planLine`), so a warmed key is exactly the key drawn later.
 * Returns the number of sprites built. Stops at `budgetMs`.
 */
export const warmUp = (
  path: CanvasPath, upcoming: readonly PreparedLine[], tMs: number, env: LineEnv, frameMs: number, budgetMs: number, st: WarmState,
): number => {
  const t0 = performance.now();
  const dropped: Dropped = { blur: 0 };
  const wanted = path.mode() === 'canvas' || path.busy(tMs) || upcomingLoad(path, upcoming) >= AUTO_LOAD;
  if (!wanted) return 0;
  let built = 0;
  if (st.done.size > 8000) st.done.clear();
  for (const line of upcoming) {
    if (performance.now() - t0 >= budgetMs) break;
    if (st.done.has(line.event.id) || !path.complexity(line).eligible) continue;
    const seen = new Set<string>();
    let complete = true;
    for (const t of sampleTimes(line, frameMs)) {
      const it = planLine(line, t, env, path.complexity(line).animated, dropped);
      if (seen.has(it.key) || path.cache.peek(it.key) !== undefined) continue;
      seen.add(it.key);
      if (performance.now() - t0 >= budgetMs) { complete = false; break; }
      path.prebuild(it.key, it.spec);
      built++;
    }
    if (complete) st.done.add(line.event.id);
  }
  return built;
};

const upcomingLoad = (path: CanvasPath, lines: readonly PreparedLine[]): number => {
  let n = 0;
  for (const l of lines) { const c = path.complexity(l); if (c.eligible) n += c.score; if (n >= AUTO_LOAD) break; }
  return n;
};
