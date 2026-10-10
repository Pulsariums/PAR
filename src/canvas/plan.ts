import { clipAt, fadeAlphaAt, positionAt } from '../anim/LineAnim';
import { type PreparedLine } from '../anim/Prepared';
import { alignX, alignY, marginAnchor } from '../layout/Anchor';
import { clipShape, type ClipShape } from '../render/clipCss';
import { xRatio } from '../render/textCss';
import type { LineEnv } from '../render/LineView';

import { specKey } from './key';
import { buildSpec, type Dropped } from './paint';
import { cachedStates } from './states';
import type { DrawItem, SpriteSpec } from './types';

/** Clip regions of a line at `t`: its rect/vector `\clip` (animated by `\t(\clip)`) and the separate vector clip. */
const clipsAt = (line: PreparedLine, t: number): ClipShape[] => {
  const tags = line.event.lineTags;
  const out: ClipShape[] = [];
  const main = clipShape(line.clipTransitions.length === 0 ? tags.clip : clipAt(tags.clip, line.clipTransitions, t, line.durationMs, line.fullRect));
  if (main) out.push(main);
  const v = clipShape(tags.vclip);
  if (v) out.push(v);
  return out;
};

/** Events shorter than this (ms) are drawn with their clip directly: a bitmap built for a frame or two is never reused. */
const MIN_BAKE_MS = 200;

const isStill = (line: PreparedLine, animated: ReadonlySet<string>): boolean =>
  line.durationMs >= MIN_BAKE_MS && !line.event.lineTags.move && line.clipTransitions.length === 0 && !animated.has('fs') && !animated.has('fscx') && !animated.has('fscy');

/** What the sprite of one event at `t` ms since line start is made of: its spec, cache key and the shared opacity (no placement, no clip). */
export const specAt = (line: PreparedLine, t: number, env: LineEnv, animated: ReadonlySet<string>, dropped: Dropped): { spec: SpriteSpec; key: string; alpha: number } => {
  const st = cachedStates(line, t, env.styles)[0];
  const { spec, alpha } = buildSpec(line.event.fragments[0].text, line.plated, st, env, line.kerning, animated, dropped);
  return { spec, key: specKey(spec), alpha };
};

/**
 * The frame plan of one event: everything the canvas needs at `t` ms since line start, resolved from the same state evaluation
 * (`evalStates`, `positionAt`, `fadeAlphaAt`, `clipAt`) the DOM path uses. Pure: no canvas, no DOM.
 */
export const planLine = (line: PreparedLine, t: number, env: LineEnv, animated: ReadonlySet<string>, dropped: Dropped): DrawItem => {
  const st = cachedStates(line, t, env.styles)[0];
  const { spec, alpha } = buildSpec(line.event.fragments[0].text, line.plated, st, env, line.kerning, animated, dropped);
  const anchor = positionAt(line.event.lineTags, t, line.durationMs) ?? marginAnchor(line.an, line.margins, env.layout);
  const fade = fadeAlphaAt(line.event.lineTags, t, line.durationMs);
  const xr = xRatio(st);
  return {
    id: line.event.id, index: line.event.index, layer: line.event.layer, spec, key: specKey(spec),
    alpha: alpha * (1 - fade / 255), anchor, org: line.event.lineTags.org ?? anchor, rot: -st.frz,
    size: (st.fs * st.fscy) / 100, ax: alignX(line.an), ay: alignY(line.an), clip: clipsAt(line, t),
    shx: st.fax * xr, shy: xr > 0 ? st.fay / xr : 0,
    still: isStill(line, animated),
  };
};
