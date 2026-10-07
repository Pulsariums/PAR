import type { PreparedLine } from '../anim/Prepared';
import { frameMs as frameStart, frameRate } from '../core/time';
import type { LineEnv } from '../render/LineView';

import type { ClipShape } from '../render/clipCss';

import { bakeable, bakeKey } from './bake';
import type { Dropped } from './paint';
import { planLine, specAt } from './plan';
import type { DrawItem, SpriteSpec } from './types';

/** Most frames of one event that are sampled for sprites (a `\t` that lasts longer than this at 24 fps is planned up to here; the rest is built when drawn). */
const MAX_SAMPLES = 1200;

/** `\t` targets that only move, turn or shear the finished bitmap: they never change which sprite is drawn. */
const KEY_NEUTRAL: ReadonlySet<string> = new Set(['frz', 'fax', 'fay']);

/** True when a `\t` animates something the sprite is made of (size, blur, border, shadow, colours, spacing, scale): the key then changes with time. */
export const keyAnimated = (animated: ReadonlySet<string>): boolean => {
  for (const k of animated) if (!KEY_NEUTRAL.has(k)) return true;
  return false;
};

/**
 * Times (ms since line start) to sample so every sprite variant the event will need is seen. A event whose sprite cannot change
 * (`keyed` false: no `\t` on anything the sprite is made of, whatever it does to position, rotation, fade or clip) has one variant:
 * one sample. Otherwise every frame of its life, because quantised colours and blurs change class at arbitrary frames and a
 * sprite not built ahead is a sprite late for its frame. With `startMs` (the event's absolute start) the samples sit on the
 * frames that will actually be drawn: frames are at whole multiples of `frameMs`, not at the event's start offset.
 */
export const sampleTimes = (line: PreparedLine, frameMs: number, startMs?: number, keyed: boolean = line.animated): number[] => {
  if (!keyed) return [0];
  const out: number[] = [];
  if (startMs === undefined) {
    for (let t = 0; t < line.durationMs && out.length < MAX_SAMPLES; t += frameMs) out.push(Math.round(t));
    return out;
  }
  // The frames drawn are `frameStart(n, rate)` (exact NTSC fractions, see time.ts), not multiples of a rounded frame length.
  const rate = frameRate(1000 / frameMs);
  let n = Math.max(0, Math.floor((startMs * rate.num) / (1000 * rate.den)) - 1);
  while (frameStart(n, rate) < startMs) n++;
  for (; out.length < MAX_SAMPLES; n++) {
    const rel = frameStart(n, rate) - startMs;
    if (rel >= line.durationMs && out.length > 0) break;
    out.push(rel);
    if (rel >= line.durationMs) break;
  }
  return out;
};

/** A sprite one event needs: its cache key, the spec to build it from, when (absolute ms) it is first drawn and the last ms it may still be drawn. */
export interface SpriteReq {
  key: string;
  spec: SpriteSpec;
  ms: number;
  until: number;
  /** A complex vector clip that stays put: the clip-cut bitmap worth making once the sprite exists (see `bake.ts`). */
  bake?: { key: string; item: DrawItem; clip: ClipShape };
}

/**
 * Every distinct sprite an event needs over its life, in the order it is first drawn: the one derivation of "which sprites does this
 * event want" (the look-ahead, the warm plan and the script analyzer all use it, and it keys on the same `specAt` the draw uses).
 */
export const spriteRequests = (line: PreparedLine, env: LineEnv, animated: ReadonlySet<string>, frameMs: number, startMs: number, dropped: Dropped = { blur: 0 }, withBake = false): SpriteReq[] => {
  const keyed = keyAnimated(animated);
  const clipped = withBake && !!(line.event.lineTags.clip || line.event.lineTags.vclip);
  const seen = new Map<string, SpriteReq>();
  const end = startMs + line.durationMs;
  for (const rel of sampleTimes(line, frameMs, startMs, keyed)) {
    const { key, spec } = specAt(line, rel, env, animated, dropped);
    const at = startMs + rel;
    const r = seen.get(key);
    if (r) r.until = keyed ? at + frameMs : end;
    else seen.set(key, { key, spec, ms: at, until: keyed ? at + frameMs : end, bake: clipped ? bakeOf(line, rel, env, animated, dropped) : undefined });
  }
  return [...seen.values()];
};

const bakeOf = (line: PreparedLine, rel: number, env: LineEnv, animated: ReadonlySet<string>, dropped: Dropped): SpriteReq['bake'] => {
  const item = planLine(line, rel, env, animated, dropped);
  const clip = bakeable(item);
  return clip ? { key: bakeKey(item, clip), item, clip } : undefined;
};
