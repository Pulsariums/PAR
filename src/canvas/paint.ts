import type { TextState } from '../anim/State';
import { blurSigma } from '../render/blur';
import { layering } from '../render/plates';
import { xRatio, type StyleEnv } from '../render/textCss';

import { colourCss, MIN_SIGMA_DEVICE, qRatio, qSigma, qSize } from './quant';
import type { PlateSpec, SpriteSpec } from './types';

/** Counts of details this resolution left out (`CanvasStats.detailDropped`). */
export interface Dropped { blur: number }

interface Used { bgr: number; a: number; key: string }

/**
 * Sprite spec (and the shared opacity) of one text state: what the DOM path expresses as plates / text-shadow / filter.
 *
 * When the line animates `\blur` (`animated` has `blur`) the plates are built sharp and the exact per-frame sigma goes into the
 * returned `sigma` (the `DrawItem.blur` the composition applies); `blurMax` (the largest `\blur` value the line reaches) reserves
 * `pad` = 3 sigma of margin on the bitmap so the draw-time tail cannot clip. Static blur stays baked into the plates exactly as
 * before. `sigma` is 0 for static sprites (their bitmap is complete as it is).
 */
export const buildSpec = (
  text: string, plated: boolean, st: TextState, env: StyleEnv & { devScale?: number }, kerning: boolean,
  animated: ReadonlySet<string>, dropped: Dropped, blurMax = 0,
): { spec: SpriteSpec; alpha: number; sigma: number } => {
  const f = env.devScale ?? 1;
  const font = env.fonts.resolve(st.fn, st.b, st.i);
  const l = layering(st, env, false);
  const bs = env.borderScale;
  const anim = animated.has('blur');
  const exact = blurSigma(st.blur, env.blurScale ?? 1);
  // Below the device-pixel threshold the blur is invisible and left out, exactly as the baked path leaves it out.
  const live = exact * f >= MIN_SIGMA_DEVICE ? exact : 0;
  // The plate blur baked into the bitmap: static = the exact sigma (unchanged from before); animated = none (applied at
  // composition, per frame).
  const baked = qSigma(exact, false);
  const sigma = anim ? 0 : (baked * f >= MIN_SIGMA_DEVICE ? baked : 0);
  if (st.blur > 0 && (anim ? live : sigma) === 0) dropped.blur++;
  const c1: Used = { bgr: st.c1, a: st.a1, key: 'c1' };
  const c3: Used = { bgr: st.c3, a: st.a3, key: 'c3' };
  const c4: Used = { bgr: st.c4, a: st.a4, key: 'c4' };
  const plan: Array<{ u: Used; plate: Omit<PlateSpec, 'fill' | 'stroke' | 'shadow'>; fill: boolean; stroke: boolean; shadow?: Used; sc?: Used }> = [];
  const base = { strokeW: l.border * 2, dx: 0, dy: 0, blur: 0, carve: false };
  if (plated) {
    if (l.shadowKept) plan.push({ u: c4, plate: { ...base, dx: st.xshad * bs, dy: st.yshad * bs, blur: sigma, carve: l.border > 0 && !l.fillInShadow }, fill: true, stroke: l.border > 0 });
    if (l.border > 0) plan.push({ u: c3, plate: { ...base, blur: sigma, carve: !l.fillInBorder }, fill: false, stroke: true });
    plan.push({ u: c1, plate: { ...base, strokeW: 0, blur: l.blurFill ? sigma : 0 }, fill: true, stroke: false });
  } else {
    const shadow = l.shadowOn ? c4 : undefined;
    plan.push({ u: c1, plate: { ...base, strokeW: l.border * 2, blur: sigma }, fill: true, stroke: l.border > 0, shadow, sc: c3 });
  }
  // One shared alpha is applied when drawing (cheap fades, shared bitmaps); different alphas are baked into the colours.
  const alphas = plan.flatMap((p) => [p.u.a, ...(p.shadow ? [p.shadow.a] : []), ...(p.sc && p.stroke ? [p.sc.a] : [])]);
  const shared = alphas.every((a) => a === alphas[0]);
  const col = (u: Used): string => colourCss(u.bgr, animated.has(u.key), shared ? null : u.a);
  const plates: PlateSpec[] = plan.map((p) => ({
    ...p.plate,
    fill: p.fill ? col(p.u) : null,
    stroke: p.stroke ? col(p.sc ?? p.u) : null,
    shadow: p.shadow ? { dx: st.xshad * bs, dy: st.yshad * bs, colour: col(p.shadow) } : null,
  }));
  const spec: SpriteSpec = {
    text, family: font.family, weight: font.weight, italic: font.italic, size: qSize((st.fs * st.fscy) / 100), ratio: font.ratio,
    rx: qRatio(xRatio(st)), spacing: (st.fsp * st.fscy) / 100, kerning, plates, scale: f,
  };
  if (anim) {
    // Room for the widest tail the animation can reach (libass clamps `\blur` at BLUR_MAX, so this is bounded by the same figure
    // the baked path already carries for its largest class): three sigmas of the envelope maximum.
    spec.animBlur = true;
    spec.pad = 3 * blurSigma(Math.max(blurMax, st.blur), env.blurScale ?? 1);
  }
  return { spec, alpha: shared ? 1 - alphas[0] / 255 : 1, sigma: anim ? live : 0 };
};
