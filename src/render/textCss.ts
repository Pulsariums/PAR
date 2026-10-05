import type { KaraokePhase } from '../anim/Karaoke';
import type { TextState } from '../anim/State';

import { cssColor } from './color';

/**
 * libass sizes fonts so that ascender + descender equals `\fs`; CSS sizes the em box.
 * For common fonts (ascent + descent ~ 1.11 em) this ratio maps one onto the other.
 */
export const FONT_SIZE_RATIO = 0.9;

export interface StyleEnv {
  /** Multiplier for border/shadow/blur (ScaledBorderAndShadow handling). */
  borderScale: number;
  fontMap: Record<string, string>;
}

export type Css = Record<string, string>;

const px = (n: number): string => `${Math.round(n * 1000) / 1000}px`;

export const fontFamilyCss = (fn: string, fontMap: Record<string, string>): string => {
  const name = fn.replace(/^@/, '').trim();
  const mapped = fontMap[name];
  if (mapped) return mapped;
  return `"${name.replace(/["\\]/g, '')}", sans-serif`;
};

/** `\b` value => CSS font-weight (1/-1 bold, 0 normal, 100..900 explicit). */
export const weightCss = (b: number): string => {
  if (b === 0) return '400';
  if (b >= 100 && b <= 900) return String(Math.round(b / 100) * 100);
  return '700';
};

/** Font size in layout px (vertical scale `\fscy` folded in). */
export const fontPx = (st: TextState): number => (st.fs * st.fscy) / 100;

/** Horizontal glyph scale relative to the vertical one (`\fscx` / `\fscy`). */
export const xRatio = (st: TextState): number => (st.fscy > 0 ? st.fscx / st.fscy : 1);

/** Font metrics shared by a fragment and its karaoke overlay. */
export const fontCss = (st: TextState, env: StyleEnv): Css => {
  const size = fontPx(st);
  const deco = [st.u ? 'underline' : '', st.s ? 'line-through' : ''].filter(Boolean).join(' ');
  return {
    'font-family': fontFamilyCss(st.fn, env.fontMap),
    'font-size': px(size * FONT_SIZE_RATIO),
    'line-height': px(size),
    'font-weight': weightCss(st.b),
    'font-style': st.i ? 'italic' : 'normal',
    'letter-spacing': px((st.fsp * st.fscy) / 100),
    'text-decoration-line': deco || 'none',
  };
};

/** Blur in layout px: `\blur` is ~ a gaussian sigma, each `\be` pass ~ 0.6 px sigma. */
export const blurPx = (st: TextState, env: StyleEnv): number =>
  (st.blur + Math.sqrt(st.be) * 0.6) * env.borderScale;

/** Fill, outline, shadow, blur and opaque box (BorderStyle 3) of a text fragment. */
export const paintCss = (st: TextState, phase: KaraokePhase | null, env: StyleEnv, secondaryFill: boolean): Css => {
  const useSecondary = secondaryFill || (phase !== null && phase.fill < 1);
  const fill = useSecondary ? cssColor(st.c2, st.a2) : cssColor(st.c1, st.a1);
  const bs = env.borderScale;
  const bord = Math.max(st.xbord, st.ybord) * bs;
  const outline = phase === null || phase.outline;
  const shadowOn = st.xshad !== 0 || st.yshad !== 0;
  const blur = blurPx(st, env);
  const css: Css = {
    color: fill,
    filter: blur > 0 ? `blur(${px(blur)})` : 'none',
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
