import type { KaraokePhase } from '../anim/Karaoke';
import type { TextState } from '../anim/State';

import type { FontEnv } from '../fonts/env';
import { DEFAULT_RATIO } from '../fonts/ratio';
import { fontFamilyCss, wantedWeight } from '../fonts/resolver';

import { blurFilter } from './blur';
import { cssColor } from './color';

/** Fallback `\fs` to CSS size factor when a font's metrics are unknown (see `fonts/ratio.ts` for the real rule). */
export const FONT_SIZE_RATIO = DEFAULT_RATIO;

export interface StyleEnv {
  /** Multiplier for border and shadow (ScaledBorderAndShadow handling); blur is never scaled by it (libass `blur_scale`). */
  borderScale: number;
  /** libass blur_scale relative to the layout (layout height / LayoutRes or storage height); default 1. */
  blurScale?: number;
  /** Font name => family, weight and size factor (loaded faces, `fontMap`, system probe). */
  fonts: FontEnv;
}

export type Css = Record<string, string>;

const px = (n: number): string => `${Math.round(n * 1000) / 1000}px`;

export { fontFamilyCss };

/** `\b` value => CSS font-weight (1/-1 bold, 0 normal, 100..900 explicit). */
export const weightCss = (b: number): string => String(wantedWeight(b));

/** Font size in layout px (vertical scale `\fscy` folded in). */
export const fontPx = (st: TextState): number => (st.fs * st.fscy) / 100;

/** Horizontal glyph scale relative to the vertical one (`\fscx` / `\fscy`). */
export const xRatio = (st: TextState): number => (st.fscy > 0 ? st.fscx / st.fscy : 1);

/** Font metrics shared by a fragment and its karaoke overlay. */
export const fontCss = (st: TextState, env: StyleEnv): Css => {
  const size = fontPx(st);
  const deco = [st.u ? 'underline' : '', st.s ? 'line-through' : ''].filter(Boolean).join(' ');
  const f = env.fonts.resolve(st.fn, st.b, st.i);
  return {
    'font-family': f.family,
    'font-size': px(size * f.ratio),
    'line-height': px(size),
    'font-weight': String(f.weight),
    'font-style': f.italic ? 'italic' : 'normal',
    'letter-spacing': px((st.fsp * st.fscy) / 100),
    'text-decoration-line': deco || 'none',
  };
};

/** Fill, outline, shadow, blur and opaque box (BorderStyle 3) of a text fragment. */
export const paintCss = (st: TextState, phase: KaraokePhase | null, env: StyleEnv, secondaryFill: boolean): Css => {
  const useSecondary = secondaryFill || (phase !== null && phase.fill < 1);
  const fill = useSecondary ? cssColor(st.c2, st.a2) : cssColor(st.c1, st.a1);
  const bs = env.borderScale;
  const bord = Math.max(st.xbord, st.ybord) * bs;
  const outline = phase === null || phase.outline;
  const shadowOn = st.xshad !== 0 || st.yshad !== 0;
  const css: Css = {
    color: fill,
    filter: blurFilter(st.blur, st.be, env.blurScale ?? 1),
  };
  if (st.style.borderStyle === 3) {
    css['-webkit-text-stroke-width'] = '0px';
    css['text-shadow'] = 'none';
    css['background-color'] = outline ? cssColor(st.c3, st.a3) : 'transparent';
    css.padding = px(bord);
    css['box-shadow'] = shadowOn ? `${px(st.xshad * bs)} ${px(st.yshad * bs)} 0 ${cssColor(st.c4, st.a4)}` : 'none';
    return css;
  }
  css['background-color'] = 'transparent';
  css.padding = '0px';
  css['box-shadow'] = 'none';
  css['paint-order'] = 'stroke fill';
  css['-webkit-text-stroke-width'] = outline && bord > 0 ? px(bord * 2) : '0px';
  css['-webkit-text-stroke-color'] = cssColor(st.c3, st.a3);
  css['text-shadow'] = shadowOn ? `${px(st.xshad * bs)} ${px(st.yshad * bs)} 0 ${cssColor(st.c4, st.a4)}` : 'none';
  return css;
};
