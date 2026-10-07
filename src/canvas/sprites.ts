import type { PreparedLine } from '../anim/Prepared';
import type { LineEnv } from '../render/LineView';

import type { Dropped } from './paint';
import { planLine } from './plan';
import type { SpriteSpec } from './types';

/** Most frames of one event that are sampled for sprites. */
const MAX_SAMPLES = 24;

/**
 * Times (ms since line start) to sample so every sprite variant the event will need is seen: one for static events, the video frame
 * grid otherwise. With `startMs` (the event's absolute start) the samples sit on the frames that will actually be drawn: frames are
 * at whole multiples of `frameMs`, not at the event's start offset, and quantisation boundaries make the two grids differ.
 */
export const sampleTimes = (line: PreparedLine, frameMs: number, startMs?: number): number[] => {
  if (!line.animated) return [0];
  const step = Math.max(frameMs, line.durationMs / MAX_SAMPLES);
  const out: number[] = [];
  if (startMs === undefined) {
    for (let t = 0; t < line.durationMs && out.length < MAX_SAMPLES; t += step) out.push(Math.round(t));
    return out;
  }
  const every = Math.max(1, Math.round(step / frameMs));
  for (let k = Math.ceil(startMs / frameMs); out.length < MAX_SAMPLES; k += every) {
    const rel = Math.max(0, Math.round(k * frameMs) - startMs);
    if (rel >= line.durationMs && out.length > 0) break;
    out.push(rel);
    if (rel >= line.durationMs) break;
  }
  return out;
};


/** A sprite one event needs: its cache key, the spec to build it from, and when (absolute ms) it is first drawn. */
export interface SpriteReq {
  key: string;
  spec: SpriteSpec;
  ms: number;
}

/**
 * Every distinct sprite an event needs over its life, in the order it is first drawn: the one derivation of "which sprites does this
 * event want" (the lookahead, the warm plan and the script analyzer all use it, and it is the same `planLine` the draw uses).
 */
export const spriteRequests = (line: PreparedLine, env: LineEnv, animated: ReadonlySet<string>, frameMs: number, startMs: number, dropped: Dropped = { blur: 0 }): SpriteReq[] => {
  const seen = new Set<string>();
  const out: SpriteReq[] = [];
  for (const rel of sampleTimes(line, frameMs, startMs)) {
    const it = planLine(line, rel, env, animated, dropped);
    if (seen.has(it.key)) continue;
    seen.add(it.key);
    out.push({ key: it.key, spec: it.spec, ms: startMs + rel });
  }
  return out;
};
