import { describe, expect, it } from 'vitest';

import { prepareLine, evalStates } from '../src/anim/Prepared';
import { fadeAlphaAt, positionAt } from '../src/anim/LineAnim';
import { analyzeLine, AUTO_LOAD, chooseMode } from '../src/canvas/eligibility';
import { specKey } from '../src/canvas/key';
import { planLine } from '../src/canvas/plan';
import { qRatio, qSigma, qSize, colourCss } from '../src/canvas/quant';
import { maskOf } from '../src/canvas/tint';
import { sampleTimes } from '../src/canvas/warm';
import { frameMs, frameRate } from '../src/core/time';
import { parseScript } from '../src/parser/ScriptParser';
import type { LineEnv } from '../src/render/LineView';

const HEAD = '[Script Info]\nPlayResX: 640\nPlayResY: 360\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,10,10,10,1\nStyle: Box,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,3,2,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
const line = (text: string, style = 'Default', times = '0:00:01.00,0:00:03.00') => {
  const sc = parseScript(`${HEAD}Dialogue: 0,${times},${style},,0,0,0,,${text}\n`);
  return { sc, l: prepareLine(sc.events[0], sc.styles, sc.info) };
};
const why = (text: string, style?: string): string => { const c = analyzeLine(line(text, style).l); return c.eligible ? 'ok' : c.reason; };

describe('canvas eligibility', () => {
  it('accepts per-glyph particles and the tags they use', () => {
    expect(why('{\\an5\\pos(10,10)\\blur3\\c&HFF0000&\\1a&H40&\\frz30\\fscx80\\fscy120\\bord2\\fad(100,100)}K')).toBe('ok');
    expect(why('{\\an5\\move(0,0,50,50)\\t(0,500,\\blur6\\c&H00FF00&)\\clip(0,0,100,100)}ka')).toBe('ok');
    expect(why('{\\an5\\pos(10,10)\\clip(m 0 0 l 10 0 10 10)}K')).toBe('ok');
    expect(why('{\\pos(10,10)\\fsp2\\blur2}Kara')).toBe('ok');
    expect(why('{\\pos(10,10)\\fax0.3\\fay-0.1\\t(0,100,\\fax0)}K')).toBe('ok');
  });

  it('keeps everything it cannot reproduce exactly in the DOM', () => {
    expect(why('{\\pos(1,1)\\frx30}K')).toBe('tag frx');
    expect(why('{\\pos(1,1)\\be2}K')).toBe('tag be');
    expect(why('{\\pos(1,1)\\u1}K')).toBe('tag u');
    expect(why('{\\pos(1,1)\\k20}K')).toBe('karaoke');
    expect(why('{\\pos(1,1)\\p1}m 0 0 l 5 5')).toBe('drawing');
    expect(why('{\\pos(1,1)}A{\\c&HFF&}B')).toBe('fragments');
    expect(why('{\\pos(1,1)}two words')).toBe('whitespace');
    expect(why('{\\pos(1,1)}a\\Nb')).toBe('whitespace');
    expect(why('{\\pos(1,1)\\rBox}K')).toBe('reset');
    expect(why('{\\pos(1,1)\\t(0,100,\\fry40)}K')).toBe('tag fry');
    expect(why('{\\pos(1,1)}K', 'Box')).toBe('box');
    expect(why('K')).toBe('stacking'); // collision stacking needs the DOM measure
    expect(why('{\\pos(1,1)}' + 'x'.repeat(17))).toBe('long');
  });

  it('scores filters and plates higher and records which keys a \\t animates', () => {
    const plain = analyzeLine(line('{\\pos(1,1)}K').l);
    const heavy = analyzeLine(line('{\\pos(1,1)\\bord2\\blur3\\t(0,500,\\blur6\\c&HFF&)}K').l);
    expect(heavy.score).toBeGreaterThan(plain.score);
    expect([...heavy.animated].sort()).toEqual(['blur', 'c1']);
    expect(plain.animated.size).toBe(0);
  });

  it("'auto' goes canvas only for qualifying lines in a heavy scene; sticky decisions are the caller's", () => {
    const ok = analyzeLine(line('{\\pos(1,1)}K').l);
    const no = analyzeLine(line('{\\pos(1,1)\\frx3}K').l);
    expect(chooseMode('auto', ok, AUTO_LOAD - 1, false)).toBe('dom');
    expect(chooseMode('auto', ok, AUTO_LOAD, false)).toBe('canvas');
    expect(chooseMode('auto', ok, 1, true)).toBe('canvas');
    expect(chooseMode('auto', no, 1000, true)).toBe('dom');
    expect(chooseMode('dom', ok, 1000, true)).toBe('dom');
    expect(chooseMode('canvas', ok, 0, false)).toBe('canvas');
    expect(chooseMode('canvas', no, 0, false)).toBe('dom');
  });
});

const fonts = { resolve: () => ({ family: 'F', weight: 400, italic: false, ratio: 1, ratioSource: 'default', status: 'loaded', verified: true }) };
const env = (sc: ReturnType<typeof parseScript>, devScale = 1): LineEnv => ({ layout: { width: 640, height: 360 }, styles: sc.styles, borderScale: 1, blurScale: 1, devScale, fonts: fonts as never });

describe('frame plan equals direct evaluation', () => {
  const text = '{\\an5\\move(10,20,310,220)\\blur3\\c&H0000FF&\\1a&H20&\\fscx100\\fscy100\\fad(200,300)\\t(0,1000,\\c&H00FF00&\\blur6\\fscx150\\fscy150\\frz90)}K';
  for (const fps of [24, 30, 60, 24000 / 1001]) {
    it(`at every frame of ${fps.toFixed(3)} fps`, () => {
      const { sc, l } = line(text);
      const rate = frameRate(fps);
      const t0 = Math.round(l.event.start * 1000);
      for (let n = Math.ceil((t0 / 1000) * fps); frameMs(n, rate) < Math.round(l.event.end * 1000); n++) {
        const rel = frameMs(n, rate) - t0;
        const it = planLine(l, rel, env(sc), new Set(['blur', 'c1']), { blur: 0 });
        const st = evalStates(l, rel, sc.styles)[0];
        expect(it.anchor).toEqual(positionAt(l.event.lineTags, rel, l.durationMs));
        expect(it.rot).toBeCloseTo(-st.frz, 9);
        expect(it.size).toBeCloseTo((st.fs * st.fscy) / 100, 9);
        expect(it.alpha).toBeCloseTo((1 - st.a1 / 255) * (1 - fadeAlphaAt(l.event.lineTags, rel, l.durationMs) / 255), 9);
        expect(it.key).toBe(specKey(it.spec));
      }
    });
  }

  it('the same state gives the same sprite key (so frames and events share bitmaps) and different states do not', () => {
    const { sc, l } = line(text);
    const a = planLine(l, 100, env(sc), new Set(), { blur: 0 });
    const b = planLine(l, 100, env(sc), new Set(), { blur: 0 });
    const c = planLine(l, 900, env(sc), new Set(), { blur: 0 });
    expect(a.key).toBe(b.key);
    expect(c.key).not.toBe(a.key);
  });

  it('opacity is shared (not in the key) when every colour has the same alpha', () => {
    const { sc, l } = line('{\\an5\\pos(5,5)\\blur2\\1a&H40&}K');
    const x = planLine(l, 0, env(sc), new Set(), { blur: 0 });
    const y = planLine(prepareLine(parseScript(`${HEAD}Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an5\\pos(5,5)\\blur2\\1a&H80&}K\n`).events[0], sc.styles, sc.info), 0, env(sc), new Set(), { blur: 0 });
    expect(x.key).toBe(y.key);
    expect(x.alpha).toBeCloseTo(1 - 0x40 / 255, 9);
    expect(y.alpha).toBeCloseTo(1 - 0x80 / 255, 9);
  });

  it('blur under ~0.35 device px is drawn sharp and counted, not silently lost', () => {
    const { sc, l } = line('{\\an5\\pos(5,5)\\blur0.3}K');
    const d = { blur: 0 };
    const it = planLine(l, 0, env(sc, 0.5), new Set(), d);
    expect(it.spec.plates[0].blur).toBe(0);
    expect(d.blur).toBe(1);
  });

  it('sampleTimes covers an animated event on the frame grid and a static one with one sample', () => {
    const stat = line('{\\an5\\pos(5,5)}K').l;
    expect(sampleTimes(stat, 41.7)).toEqual([0]);
    const anim = line(text).l;
    const ts = sampleTimes(anim, 41.7);
    expect(ts[0]).toBe(0);
    expect(ts.length).toBeLessThanOrEqual(24);
    expect(ts[ts.length - 1]).toBeLessThan(anim.durationMs);
  });

  it('sampleTimes with the event start lands on the frames that will be drawn (multiples of the frame length)', () => {
    const anim = line(text).l;
    const f = 1000 / 24;
    const start = 1010; // not a frame boundary
    const ts = sampleTimes(anim, f, start);
    expect(ts.length).toBeGreaterThan(1);
    for (const t of ts) {
      const abs = start + t;
      expect(Math.abs(abs - Math.round(abs / f) * f)).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(t).toBeGreaterThanOrEqual(0);
    }
    expect(ts.every((t, i) => i === 0 || t > ts[i - 1])).toBe(true);
    // a static event needs one sample whatever the start
    expect(sampleTimes(line('{\\an5\\pos(5,5)}K').l, f, start)).toEqual([0]);
  });
});

describe('level of detail rules', () => {
  it('quantises sizes to 6 % classes, ratios to 2 %, animated sigmas to 20 % classes, animated colours to 5 bits', () => {
    for (const px of [9, 18.5, 23.2, 31.4, 49.9, 197]) {
      expect(Math.abs(qSize(px) / px - 1)).toBeLessThan(0.031);
      expect(qSize(qSize(px))).toBe(qSize(px));
    }
    expect(qRatio(1.004)).toBe(1);
    expect(qSigma(2.51, false)).toBe(2.51);
    expect(qSigma(2.5, true)).toBe(qSigma(2.6, true));
    expect(qSigma(0, true)).toBe(0);
    expect(colourCss(0x0000ff, false, null)).toBe('rgb(255,0,0)');
    expect(colourCss(0x0000fd, true, null)).toBe('rgb(256,0,0)'.replace('256', '255'));
    expect(colourCss(0x000001, true, 0x80)).toMatch(/^rgba\(0,0,0,0\.5/);
  });

  it('only a one-plate, fill-only sprite is tinted from a mask, and the mask key ignores the colour', () => {
    const { sc, l } = line('{\\an5\\pos(5,5)\\blur2\\c&H0000FF&}K');
    const m = maskOf(planLine(l, 0, env(sc), new Set(), { blur: 0 }).spec)!;
    const l2 = line('{\\an5\\pos(5,5)\\blur2\\c&H00FF00&}K').l;
    const m2 = maskOf(planLine(l2, 0, env(sc), new Set(), { blur: 0 }).spec)!;
    expect(m.key).toBe(m2.key);
    expect(m.colour).not.toBe(m2.colour);
    const bordered = line('{\\an5\\pos(5,5)\\bord2\\blur2}K').l;
    expect(maskOf(planLine(bordered, 0, env(sc), new Set(), { blur: 0 }).spec)).toBeNull();
  });
});

describe('shear', () => {
  it('folds the x-scale into the final-space coefficients (the DOM shears first, then scales x)', () => {
    const plain = line('{\\an5\\pos(5,5)\\fax0.3\\fay0.2}K');
    const a = planLine(plain.l, 0, env(plain.sc), new Set(), { blur: 0 });
    expect([a.shx, a.shy]).toEqual([0.3, 0.2]);
    const wide = line('{\\an5\\pos(5,5)\\fscx200\\fscy100\\fax0.3\\fay0.2}K');
    const b = planLine(wide.l, 0, env(wide.sc), new Set(), { blur: 0 });
    expect(b.shx).toBeCloseTo(0.6, 6);
    expect(b.shy).toBeCloseTo(0.1, 6);
    const none = line('{\\an5\\pos(5,5)}K');
    const c = planLine(none.l, 0, env(none.sc), new Set(), { blur: 0 });
    expect([c.shx, c.shy]).toEqual([0, 0]);
  });
});
