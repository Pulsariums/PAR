import { clipAt, fadeAlphaAt, positionAt } from '../anim/LineAnim';
import { evalStates, type PreparedLine } from '../anim/Prepared';
import { alignX, alignY, marginAnchor } from '../layout/Anchor';
import { clipShape, type ClipShape } from '../render/clipCss';
import type { LineEnv } from '../render/LineView';

import { buildSpec, specKey, type Dropped } from './paint';
import type { DrawItem } from './types';

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

/**
 * The frame plan of one event: everything the canvas needs at `t` ms since line start, resolved from the same state evaluation
 * (`evalStates`, `positionAt`, `fadeAlphaAt`, `clipAt`) the DOM path uses. Pure: no canvas, no DOM.
 */
export const planLine = (line: PreparedLine, t: number, env: LineEnv, animated: ReadonlySet<string>, dropped: Dropped): DrawItem => {
  const st = evalStates(line, t, env.styles)[0];
  const text = line.event.fragments[0].text;
  const { spec, alpha } = buildSpec(text, line.plated, st, env, line.kerning, animated, dropped);
  const anchor = positionAt(line.event.lineTags, t, line.durationMs) ?? marginAnchor(line.an, line.margins, env.layout);
  const fade = fadeAlphaAt(line.event.lineTags, t, line.durationMs);
  return {
    id: line.event.id, index: line.event.index, layer: line.event.layer, spec, key: specKey(spec),
    alpha: alpha * (1 - fade / 255), anchor, org: line.event.lineTags.org ?? anchor, rot: -st.frz,
    size: (st.fs * st.fscy) / 100, ax: alignX(line.an), ay: alignY(line.an), clip: clipsAt(line, t),
  };
};
