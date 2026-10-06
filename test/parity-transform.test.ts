import { describe, expect, it } from 'vitest';

import { evalStates, prepareLine } from '../src/anim/Prepared';
import { transitionProgress } from '../src/anim/State';
import { parseScript } from '../src/parser/ScriptParser';
import { parseText } from '../src/parser/TextParser';
import type { Transition } from '../src/types/script';

const HEAD = '[Script Info]\nPlayResX: 640\nPlayResY: 360\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, Bold, Alignment, MarginL, MarginR, MarginV\nStyle: Default,Arial,20,&H00FFFFFF,0,2,10,10,10\nStyle: Big,Arial,80,&H000000FF,0,2,0,0,0\n[Events]\n';
const statesAt = (text: string, t: number) => {
  const s = parseScript(`${HEAD}Dialogue: 0,0:00:00.00,0:00:10.00,Default,,0,0,0,,${text}`);
  return evalStates(prepareLine(s.events[0], s.styles, s.info), t, s.styles);
};
const tr = (t1: number, t2: number | null, accel: number): Transition => ({ type: 't', t1, t2, accel, ops: [] });

describe('\\t parity with libass', () => {
  it('t2 = 0 spans the whole event duration', () => {
    expect(transitionProgress(tr(0, 0, 1), 5000, 10000)).toBeCloseTo(0.5);
    expect(statesAt('{\\t(0,0,\\fscx300)}x', 5000)[0].fscx).toBeCloseTo(200);
    expect(statesAt('{\\t(2000,0,\\fscx300)}x', 6000)[0].fscx).toBeCloseTo(200);
  });

  it('accel 0 gives 1 and negative accel follows pow', () => {
    expect(transitionProgress(tr(0, 1000, 0), 500, 10000)).toBe(1);
    expect(transitionProgress(tr(0, 1000, -1), 500, 10000)).toBeCloseTo(2);
    expect(Number.isFinite(transitionProgress(tr(0, 1000, -1), 0, 10000))).toBe(true);
  });

  it('keeps step behaviour when t2 < t1', () => {
    expect(transitionProgress(tr(500, 100, 1), 499, 10000)).toBe(0);
    expect(transitionProgress(tr(500, 100, 1), 500, 10000)).toBe(1);
  });

  it('\\b \\i \\u \\s \\fn inside \\t apply unconditionally, even before t1', () => {
    const st = statesAt('{\\t(5000,6000,\\b1\\i1\\u1\\s1\\fnImpact\\fs40)}x', 0)[0];
    expect([st.b, st.i, st.u, st.s, st.fn]).toEqual([1, true, true, true, 'Impact']);
    expect(st.fs).toBe(20); // animatable parts still wait for t1
  });

  it('\\r inside \\t resets unconditionally and later tags animate from the reset state', () => {
    const st = statesAt('{\\fs50\\t(5000,6000,\\rBig\\fs120)}x', 0)[0];
    expect(st.style.name).toBe('Big');
    expect(st.fs).toBe(80);
  });
});

describe('karaoke parity with libass', () => {
  it('\\k without an argument is 100 cs', () => {
    const p = parseText('{\\k}a{\\k50}b');
    expect(p.fragments.map((f) => [f.karaoke!.start, f.karaoke!.duration])).toEqual([[0, 1000], [1000, 500]]);
  });

  it('continuation text takes no time: it flips when the syllable ends', () => {
    const p = parseText('{\\kf100}Hel{\\b1}lo{\\kf50}x');
    expect(p.fragments.map((f) => [f.karaoke!.start, f.karaoke!.duration, f.karaoke!.syllable])).toEqual([
      [0, 1000, 0], [1000, 0, 0], [1000, 500, 1],
    ]);
  });

  it('every later continuation piece also flips at the syllable end', () => {
    const p = parseText('{\\k20}a{\\i1}b{\\i0}c');
    expect(p.fragments.map((f) => [f.karaoke!.start, f.karaoke!.duration])).toEqual([[0, 200], [200, 0], [200, 0]]);
  });
});
