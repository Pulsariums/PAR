import type { KaraokePhase } from '../anim/Karaoke';
import type { TextState } from '../anim/State';

import { cssColor } from './color';
import type { StyleEnv } from './textCss';

/**
 * libass paints every event as up to three bitmaps, back to front: shadow, outline, fill.
 * Blur and `\be` run on those bitmaps, not on the glyphs, so PAR keeps one "plate" per bitmap:
 * a full copy of the line's text with only the paint of that plate (see `LineView`).
 * `all` is the single-plate shortcut for lines that need no per-bitmap treatment.
 */
export type Role = 'all' | 'shadow' | 'outline' | 'fill';
export const PLATE_ROLES: readonly Role[] = ['shadow', 'outline', 'fill'];

/** Marker colours for carving (see `carve.ts`): fill pixels are red, stroke-only pixels are blue. */
export const MARK_FILL = 'rgb(255, 0, 0)';
export const MARK_STROKE = 'rgb(0, 0, 255)';

export interface PlatePaint {
  visible: boolean;
  fill: string;
  stroke: string;
  /** Stroke width in layout units (centred on the contour: twice the border). */
  strokeWidth: number;
  /** Offset in layout units. */
  dx: number;
  dy: number;
  blur: number;
  be: number;
  /** Colour of the carved result: the glyph shape is cut out of the (blurred) plate. */
  carve: string | null;
}

/** The libass `FILTER_*` decisions for one fragment (`render_and_combine_glyphs`, `ass_composite_construct`). */
export interface Layering {
  /** Border in layout units (the larger of `\xbord`/`\ybord`). */
  border: number;
  shadowOn: boolean;
  /** Shadow survives: libass drops it when there is no border and the fill is fully transparent. */
  shadowKept: boolean;
  /** Border bitmap keeps the glyph area (opaque fill); otherwise the glyph is cut out of it. */
  fillInBorder: boolean;
  fillInShadow: boolean;
  /** `\blur`/`\be` hit the fill bitmap only when there is no border (BorderStyle 3 aside). */
  blurFill: boolean;
}

export const layering = (st: TextState, env: StyleEnv, karaoke: boolean): Layering => {
  const border = Math.max(st.xbord, st.ybord) * env.borderScale;
  const shadowOn = st.xshad !== 0 || st.yshad !== 0;
  const fillInShadow = shadowOn && (karaoke || st.a1 !== 255);
  return {
    border,
    shadowOn,
    shadowKept: shadowOn && (border > 0 || fillInShadow),
    fillInBorder: border > 0 && st.a1 === 0 && st.a2 === 0,
    fillInShadow,
    blurFill: border <= 0,
  };
};

/** Paint of one plate. BorderStyle 3 does not use plates (box + text are blurred together). */
export const platePaint = (
  role: Exclude<Role, 'all'>, st: TextState, phase: KaraokePhase | null, env: StyleEnv, secondary: boolean,
): PlatePaint => {
  const l = layering(st, env, secondary);
  const bs = env.borderScale;
  const none: PlatePaint = { visible: false, fill: 'transparent', stroke: 'transparent', strokeWidth: 0, dx: 0, dy: 0, blur: 0, be: 0, carve: null };
  const bm = { blur: st.blur, be: st.be };
  if (role === 'fill') {
    const second = secondary || (phase !== null && phase.fill < 1);
    const c = second ? cssColor(st.c2, st.a2) : cssColor(st.c1, st.a1);
    return { ...none, visible: true, fill: c, ...(l.blurFill ? bm : {}) };
  }
  if (role === 'outline') {
    if (l.border <= 0 || (phase !== null && !phase.outline)) return none;
    const carve = !l.fillInBorder;
    return {
      ...none, ...bm, visible: true, strokeWidth: l.border * 2,
      fill: carve ? MARK_FILL : 'transparent',
      stroke: carve ? MARK_STROKE : cssColor(st.c3, st.a3),
      carve: carve ? cssColor(st.c3, st.a3) : null,
    };
  }
  if (!l.shadowKept) return none;
  const c = cssColor(st.c4, st.a4);
  const carve = l.border > 0 && !l.fillInShadow;
  return {
    ...none, ...bm, visible: true, dx: st.xshad * bs, dy: st.yshad * bs,
    strokeWidth: l.border * 2,
    fill: carve ? MARK_FILL : c,
    stroke: carve ? MARK_STROKE : c,
    carve: carve ? c : null,
  };
};
