import { describe, expect, it } from 'vitest';

import { staticFontEnv } from '../src/fonts/env';
import { parseFont } from '../src/fonts/loader';
import { DEFAULT_RATIO, sizeRatio } from '../src/fonts/ratio';
import { FontRegistry } from '../src/fonts/registry';
import { buildTestFont } from '../src/fonts/testFont';
import type { FaceMetrics } from '../src/fonts/types';
import { stateFromStyle } from '../src/anim/State';
import { DEFAULT_STYLE } from '../src/parser/StyleParser';
import { fontCss } from '../src/render/textCss';

import { FakeHost } from './helpers/fakeFonts';

const m = (o: Partial<FaceMetrics>): FaceMetrics => ({ unitsPerEm: 1000, winAscent: 0, winDescent: 0, hheaAscent: 0, hheaDescent: 0, typoAscent: 0, typoDescent: 0, bboxYMin: 0, bboxYMax: 0, ...o });

describe('font size rule: cssFontSize = fs * unitsPerEm / (winAscent + winDescent)', () => {
  it('uses OS/2 win metrics first (libass set_font_metrics)', () => {
    expect(sizeRatio(m({ unitsPerEm: 2048, winAscent: 1854, winDescent: 434, hheaAscent: 1500, hheaDescent: -500 }))).toBeCloseTo(2048 / 2288, 10);
    expect(sizeRatio(m({ winAscent: 800, winDescent: 200 }))).toBe(1);
    expect(sizeRatio(m({ winAscent: 900, winDescent: 300 }))).toBeCloseTo(1000 / 1200, 10);
  });

  it('falls back to hhea, then typo, then the head bbox, in libass order', () => {
    expect(sizeRatio(m({ hheaAscent: 800, hheaDescent: -200, typoAscent: 700, typoDescent: -100 }))).toBe(1);
    expect(sizeRatio(m({ typoAscent: 750, typoDescent: -250, bboxYMin: -500, bboxYMax: 1000 }))).toBe(1);
    expect(sizeRatio(m({ bboxYMin: -250, bboxYMax: 750 }))).toBe(1);
  });

  it('returns null (caller keeps the 0.9 fallback) when nothing is usable', () => {
    expect(sizeRatio(null)).toBeNull();
    expect(sizeRatio(m({}))).toBeNull();
    expect(sizeRatio(m({ unitsPerEm: 0, winAscent: 800, winDescent: 200 }))).toBeNull();
    expect(DEFAULT_RATIO).toBe(0.9);
  });

  it('reads the metrics out of real font bytes and scales the CSS size with them', async () => {
    const host = new FakeHost();
    const reg = new FontRegistry(() => host);
    const owner = {};
    // win cell 1000 = em => ratio 1; the hhea values differ on purpose (they must NOT be used).
    const [one] = await parseFont({ name: 'a.ttf', data: buildTestFont({ family: 'Cell One', win: [800, 200], hhea: [900, 400] }) });
    // win cell 1250 => ratio 0.8
    const [wide] = await parseFont({ name: 'b.ttf', data: buildTestFont({ family: 'Cell Wide', win: [1000, 250], hhea: [800, 200] }) });
    expect(reg.acquire(owner, one).ratio).toBe(1);
    expect(reg.acquire(owner, wide).ratio).toBeCloseTo(0.8, 10);
  });

  it('applies the per-font factor to font-size and keeps line-height at \\fs', () => {
    const st = { ...stateFromStyle(DEFAULT_STYLE), fn: 'Whatever', fs: 50, fscy: 100 };
    const env = (ratio: number) => ({
      borderScale: 1,
      fonts: { resolve: () => ({ ...staticFontEnv().resolve('x', 0, false), ratio }) },
    });
    expect(fontCss(st, env(0.8))).toMatchObject({ 'font-size': '40px', 'line-height': '50px' });
    expect(fontCss(st, env(1))).toMatchObject({ 'font-size': '50px', 'line-height': '50px' });
    // no metrics known (jsdom has no canvas): the historical 0.9
    expect(fontCss(st, { borderScale: 1, fonts: staticFontEnv() })).toMatchObject({ 'font-size': '45px' });
  });
});
