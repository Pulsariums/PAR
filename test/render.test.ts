import { describe, expect, it } from 'vitest';

import { staticFontEnv } from '../src/fonts/env';
import { stateFromStyle } from '../src/anim/State';
import { DEFAULT_STYLE } from '../src/parser/StyleParser';
import { cssColor } from '../src/render/color';
import { displayText } from '../src/render/displayText';
import { boxTransformCss, lineTransformCss } from '../src/render/LineView';
import { fontCss, fontFamilyCss, paintCss, weightCss } from '../src/render/textCss';
import { SOFT_BREAK } from '../src/types/script';

const fontMap = { 'My Font': '"Mapped", serif' };
const env = { borderScale: 1, fonts: staticFontEnv(fontMap) };

describe('render CSS', () => {
  it('converts BGR + ASS alpha to rgba()', () => {
    expect(cssColor(0x0000ff, 0)).toBe('rgba(255, 0, 0, 1)');
    expect(cssColor(0xff0000, 0x80)).toBe('rgba(0, 0, 255, 0.498)');
  });

  it('maps fonts, weights and the soft break', () => {
    expect(fontFamilyCss('@Arial', {})).toBe('"Arial", sans-serif');
    expect(fontFamilyCss('My Font', fontMap)).toBe('"Mapped", serif');
    expect([weightCss(0), weightCss(1), weightCss(-1), weightCss(300)]).toEqual(['400', '700', '700', '300']);
    expect(displayText(`a${SOFT_BREAK}b`, 2)).toBe('a\nb');
    expect(displayText(`a${SOFT_BREAK}b`, 0)).toBe('a b');
  });

  it('folds \\fscy into the font size and line height', () => {
    const st = { ...stateFromStyle(DEFAULT_STYLE), fs: 40, fscy: 50 };
    expect(fontCss(st, env)).toMatchObject({ 'font-size': '18px', 'line-height': '20px' });
  });

  it('draws outline/shadow for BorderStyle 1 and a box for BorderStyle 3', () => {
    const st = stateFromStyle(DEFAULT_STYLE);
    expect(paintCss(st, null, env, false)).toMatchObject({ '-webkit-text-stroke-width': '4px', 'text-shadow': '2px 2px 0 rgba(0, 0, 0, 1)' });
    const box = paintCss({ ...st, style: { ...DEFAULT_STYLE, borderStyle: 3 } }, null, env, false);
    expect(box).toMatchObject({ 'background-color': 'rgba(0, 0, 0, 1)', padding: '2px', '-webkit-text-stroke-width': '0px' });
  });

  it('uses the secondary colour before a karaoke syllable and hides the \\ko outline', () => {
    const st = stateFromStyle(DEFAULT_STYLE);
    expect(paintCss(st, { fill: 0, outline: false }, env, false)).toMatchObject({ color: cssColor(st.c2, 0), '-webkit-text-stroke-width': '0px' });
    expect(paintCss(st, { fill: 1, outline: true }, env, false).color).toBe(cssColor(st.c1, 0));
  });

  it('builds rotation and shear transforms', () => {
    const st = { ...stateFromStyle(DEFAULT_STYLE), frz: 90, frx: 10 };
    expect(lineTransformCss(st)).toBe('perspective(312.5px) rotateX(10deg) rotateZ(-90deg)');
    expect(lineTransformCss(stateFromStyle(DEFAULT_STYLE))).toBe('none');
    expect(boxTransformCss(2, 1, 0, 0)).toBe('translate(-50%, -100%) scaleX(1)');
    expect(boxTransformCss(7, 1.5, 1, 0)).toBe('translate(0%, 0%) scaleX(1.5) translate(0%, 0%) skewX(45deg) translate(0%, 0%)');
  });
});
