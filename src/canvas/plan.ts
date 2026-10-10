import { clipAt, fadeAlphaAt, positionAt } from '../anim/LineAnim';
import { type PreparedLine } from '../anim/Prepared';
import { alignX, alignY, marginAnchor } from '../layout/Anchor';
import { clipShape, type ClipShape } from '../render/clipCss';
import { xRatio } from '../render/textCss';
import type { LineEnv } from '../render/LineView';
import type { StateOp } from '../types/script';

import { specKey } from './key';
import { buildSpec, type Dropped } from './paint';
import { cachedStates } from './states';
import type { DrawItem, SpriteSpec } from './types';

/**
 * The largest `\blur` value a line can reach over its life (raw tag units, clamped later by `blurSigma`): every `blur` set target of
 * every `\t` and of the fragment prefixes. A `\t` interpolates between its endpoints, so no intermediate frame exceeds the maximum of
 * the targets; relative (`~`) values are folded in as an extra bound on top. Memoized per line (the ops do not change).
 */
const envelopes = new WeakMap<PreparedLine, number>();
const blurEnvelope = (line: PreparedLine): number => {
  let m = envelopes.get(line);
  if (m === undefined) {
    m = 0;
    let rel = 0;
    const walk = (ops: readonly StateOp[]): void => {
      for (const o of ops) {
        if (o.type === 'set') {
          if (o.key === 'blur' && typeof o.value === 'number') {
            if (o.relative) rel += Math.abs(o.value);
            else m = Math.max(m!, o.value);
          }
        } else if (o.type === 't') walk(o.ops);
      }
    };
    for (const f of line.event.fragments) walk(f.ops);
    envelopes.set(line, (m = Math.max(m, m + rel)));
  }
  return m;
};

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

/** What the sprite of one event at `t` ms since line start is made of: its spec, cache key, the shared opacity and the draw-time sigma (no placement, no clip). */
export const specAt = (line: PreparedLine, t: number, env: LineEnv, animated: ReadonlySet<string>, dropped: Dropped): { spec: SpriteSpec; key: string; alpha: number; sigma: number } => {
  const st = cachedStates(line, t, env.styles)[0];
  const { spec, alpha, sigma } = buildSpec(line.event.fragments[0].text, line.plated, st, env, line.kerning, animated, dropped, blurEnvelope(line));
  return { spec, key: specKey(spec), alpha, sigma };
};

/**
 * The frame plan of one event: everything the canvas needs at `t` ms since line start, resolved from the same state evaluation
 * (`evalStates`, `positionAt`, `fadeAlphaAt`, `clipAt`) the DOM path uses. Pure: no canvas, no DOM.
 */
export const planLine = (line: PreparedLine, t: number, env: LineEnv, animated: ReadonlySet<string>, dropped: Dropped): DrawItem => {
  const st = cachedStates(line, t, env.styles)[0];
  const { spec, alpha, sigma } = buildSpec(line.event.fragments[0].text, line.plated, st, env, line.kerning, animated, dropped, blurEnvelope(line));
  const anchor = positionAt(line.event.lineTags, t, line.durationMs) ?? marginAnchor(line.an, line.margins, env.layout);
  const fade = fadeAlphaAt(line.event.lineTags, t, line.durationMs);
  const xr = xRatio(st);
  return {
    id: line.event.id, index: line.event.index, layer: line.event.layer, spec, key: specKey(spec),
    alpha: alpha * (1 - fade / 255), anchor, org: line.event.lineTags.org ?? anchor, rot: -st.frz,
    size: (st.fs * st.fscy) / 100, ax: alignX(line.an), ay: alignY(line.an), clip: clipsAt(line, t),
    shx: st.fax * xr, shy: xr > 0 ? st.fay / xr : 0,
    blur: sigma > 0 ? sigma : undefined,
    still: isStill(line, animated),
  };
};
