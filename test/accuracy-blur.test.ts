import { describe, expect, it } from 'vitest';

import { stateFromStyle } from '../src/anim/State';
import { DEFAULT_STYLE } from '../src/parser/StyleParser';
import { BE_MAX, BLUR_MAX, BLUR_SIGMA, beCount, beFn, beSigmaDevicePx, blurFilter, blurFn, blurSigma, totalSigma } from '../src/render/blur';
import { layering, platePaint } from '../src/render/plates';
import { staticFontEnv } from '../src/fonts/env';
import { parseBlock } from '../src/parser/TagParser';
import { foldOps } from '../src/anim/State';

const env = { borderScale: 1, fonts: staticFontEnv({}) };
const base = () => ({ ...stateFromStyle({ ...DEFAULT_STYLE, outline: 3, shadow: 0 }) });

describe('blur math (libass ass_render.c / c_be_blur.c)', () => {
  it('converts \\blur to a gaussian sigma of N * 2 / sqrt(ln 256)', () => {
    expect(BLUR_SIGMA).toBeCloseTo(0.8493, 4);
    expect(blurSigma(5)).toBeCloseTo(4.2466, 3);
    expect(blurSigma(0)).toBe(0);
    expect(blurSigma(-3)).toBe(0);
    expect(blurSigma(1000)).toBeCloseTo(BLUR_MAX * BLUR_SIGMA, 6);
  });

  it('rounds and clamps \\be like libass (+0.5, 0..127)', () => {
    expect([0.4, 0.5, 1.49, 2.5, -3, 500].map(beCount)).toEqual([0, 1, 1, 3, 0, BE_MAX]);
  });

  it('models N \\be passes as a gaussian of sigma sqrt(N/2) device pixels', () => {
    expect(beSigmaDevicePx(2)).toBeCloseTo(1, 6);
    expect(beSigmaDevicePx(8)).toBeCloseTo(2, 6);
    expect(beSigmaDevicePx(0)).toBe(0);
  });

  it('composes \\blur then \\be by adding variances', () => {
    expect(totalSigma(0, 2, 1)).toBeCloseTo(1, 6);
    expect(totalSigma(3, 0, 1)).toBeCloseTo(blurSigma(3), 6);
    expect(totalSigma(3, 8, 1)).toBeCloseTo(Math.sqrt(blurSigma(3) ** 2 + 4), 6);
    // \be does not scale with the layout, only with device pixels
    expect(totalSigma(0, 2, 0.5)).toBeCloseTo(0.5, 6);
  });

  it('builds CSS filters: \\blur in layout px, \\be through --par-u', () => {
    expect(blurFilter(0, 0)).toBe('none');
    expect(blurFn(2)).toEqual(['blur(1.699px)']);
    expect(beFn(2)).toEqual(['blur(calc(var(--par-u, 1) * 1px))']);
    expect(blurFilter(2, 2)).toBe('blur(1.699px) blur(calc(var(--par-u, 1) * 1px))');
  });

  it('clamps \\blur at parse time and keeps it non-negative', () => {
    const run = (tag: string) => foldOps(base(), parseBlock(tag).ops, { t: 0, durationMs: 1000, resetStyle: () => DEFAULT_STYLE }).blur;
    expect(run('\\blur3.5')).toBe(3.5);
    expect(run('\\blur-2')).toBe(0);
    expect(run('\\blur500')).toBe(BLUR_MAX);
  });
});

describe('plates (libass FILTER_* decisions)', () => {
  it('blurs the fill only when there is no border; the outline always', () => {
    const st = { ...base(), blur: 4 };
    expect(platePaint('fill', st, null, env, false).blur).toBe(0);
    expect(platePaint('outline', st, null, env, false).blur).toBe(4);
    const noBorder = { ...st, xbord: 0, ybord: 0 };
    expect(platePaint('fill', noBorder, null, env, false).blur).toBe(4);
    expect(platePaint('outline', noBorder, null, env, false).visible).toBe(false);
  });

  it('applies \\be to the same bitmaps as \\blur', () => {
    const st = { ...base(), be: 3 };
    expect(platePaint('fill', st, null, env, false).be).toBe(0);
    expect(platePaint('outline', st, null, env, false).be).toBe(3);
  });

  it('keeps the glyph in the outline for an opaque fill, cuts it out otherwise', () => {
    expect(layering(base(), env, false).fillInBorder).toBe(true);
    expect(platePaint('outline', base(), null, env, false).carve).toBeNull();
    const translucent = { ...base(), a1: 0x80 };
    expect(layering(translucent, env, false).fillInBorder).toBe(false);
    expect(platePaint('outline', translucent, null, env, false).carve).not.toBeNull();
  });

  it('drops the shadow without border when the fill is fully transparent, hollow shadow with a border', () => {
    const shadowed = { ...base(), xshad: 3, yshad: 3 };
    const noBorderInvisible = { ...shadowed, xbord: 0, ybord: 0, a1: 255 };
    expect(layering(noBorderInvisible, env, false).shadowKept).toBe(false);
    expect(platePaint('shadow', noBorderInvisible, null, env, false).visible).toBe(false);
    const hollow = { ...shadowed, a1: 255 };
    expect(platePaint('shadow', hollow, null, env, false).carve).not.toBeNull();
    expect(platePaint('shadow', shadowed, null, env, false)).toMatchObject({ visible: true, carve: null, dx: 3, dy: 3 });
  });

  it('scales border and shadow with the border scale, never the blur', () => {
    const st = { ...base(), blur: 2, xshad: 2, yshad: 2 };
    const scaled = { ...env, borderScale: 0.5 };
    expect(platePaint('outline', st, null, scaled, false)).toMatchObject({ strokeWidth: 3, blur: 2 });
    expect(platePaint('shadow', st, null, scaled, false)).toMatchObject({ dx: 1, dy: 1, blur: 2 });
  });

  it('uses the larger of \\xbord / \\ybord', () => {
    expect(layering({ ...base(), xbord: 6, ybord: 1 }, env, false).border).toBe(6);
  });
});
