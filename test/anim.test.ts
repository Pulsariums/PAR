import { describe, expect, it } from 'vitest';

import { karaokePhase } from '../src/anim/Karaoke';
import { clipAt, fadeAlphaAt, positionAt } from '../src/anim/LineAnim';
import { evalStates, prepareLine } from '../src/anim/Prepared';
import { lerpColor, transitionProgress } from '../src/anim/State';
import { parseScript } from '../src/parser/ScriptParser';
import { parseText } from '../src/parser/TextParser';
import type { Transition } from '../src/types/script';

const HEAD = '[Script Info]\nPlayResX: 640\nPlayResY: 360\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, Bold, Alignment, MarginL, MarginR, MarginV\nStyle: Default,Arial,20,&H00FFFFFF,0,2,10,10,10\nStyle: Big,Arial,80,&H000000FF,0,2,0,0,0\n[Events]\n';

/** States of the first line of a one-line script at `t` ms. */
const statesAt = (text: string, t: number, end = '0:00:02.00') => {
  const s = parseScript(`${HEAD}Dialogue: 0,0:00:00.00,${end},Default,,0,0,0,,${text}`);
  const line = prepareLine(s.events[0], s.styles, s.info);
  return evalStates(line, t, s.styles);
};

describe('\\t interpolation', () => {
  it('interpolates linearly between t1 and t2', () => {
    expect(statesAt('{\\t(0,1000,\\fs60)}x', 0)[0].fs).toBe(20);
    expect(statesAt('{\\t(0,1000,\\fs60)}x', 500)[0].fs).toBe(40);
    expect(statesAt('{\\t(0,1000,\\fs60)}x', 1500)[0].fs).toBe(60);
  });

  it('applies the acceleration exponent', () => {
    expect(statesAt('{\\t(0,1000,2,\\fscx200)}x', 500)[0].fscx).toBeCloseTo(125);
  });

  it('uses the line duration when times are omitted', () => {
    expect(statesAt('{\\t(\\frz90)}x', 1000)[0].frz).toBeCloseTo(45);
  });

  it('is a step function when t2 <= t1', () => {
    const tr: Transition = { type: 't', t1: 500, t2: 500, accel: 1, ops: [] };
    expect(transitionProgress(tr, 499, 2000)).toBe(0);
    expect(transitionProgress(tr, 500, 2000)).toBe(1);
  });

  it('interpolates colours per channel and alpha numerically', () => {
    expect(lerpColor(0x000000, 0xff00ff, 0.5)).toBe(0x800080);
    const st = statesAt('{\\t(0,1000,\\1c&H0000FF&\\1a&HFF&)}x', 500)[0];
    expect(st.c1).toBe(0x8080ff); // BGR: B,G 255 -> 0 (half = 128), R stays 255
    expect(st.a1).toBe(128);
  });

  it('respects tag order: a later static tag overrides the transition', () => {
    expect(statesAt('{\\t(0,1000,\\fs60)\\fs10}x', 500)[0].fs).toBe(10);
    expect(statesAt('{\\fs10\\t(0,1000,\\fs60)}x', 500)[0].fs).toBe(35);
  });

  it('chains states across fragments and resets with \\r', () => {
    const st = statesAt('{\\fs30}a{\\b1}b{\\rBig}c{\\r}d', 0);
    expect(st.map((s) => s.fs)).toEqual([30, 30, 80, 20]);
    expect(st[1].b).toBe(1);
    expect(st[2].c1).toBe(0x0000ff);
  });

  it('applies relative font sizes', () => {
    expect(statesAt('{\\fs+5}x', 0)[0].fs).toBeCloseTo(30);
  });
});

describe('line animation', () => {
  it('moves linearly over the line, or within t1..t2', () => {
    expect(positionAt({ move: [0, 0, 100, 200] }, 500, 1000)).toEqual([50, 100]);
    expect(positionAt({ move: [0, 0, 100, 0, 200, 400] }, 100, 1000)).toEqual([0, 0]);
    expect(positionAt({ move: [0, 0, 100, 0, 200, 400] }, 300, 1000)).toEqual([50, 0]);
    expect(positionAt({ move: [0, 0, 100, 0, 200, 400] }, 900, 1000)).toEqual([100, 0]);
    expect(positionAt({}, 0, 1000)).toBeNull();
  });

  it('computes \\fad and \\fade alpha like libass', () => {
    expect(fadeAlphaAt({ fad: [200, 400] }, 0, 1000)).toBe(255);
    expect(fadeAlphaAt({ fad: [200, 400] }, 100, 1000)).toBeCloseTo(127.5);
    expect(fadeAlphaAt({ fad: [200, 400] }, 500, 1000)).toBe(0);
    expect(fadeAlphaAt({ fad: [200, 400] }, 800, 1000)).toBeCloseTo(127.5);
    expect(fadeAlphaAt({ fade: [255, 0, 128, 0, 100, 200, 300] }, 250, 1000)).toBeCloseTo(64);
  });

  it('animates rect clips through \\t', () => {
    const p = parseText('{\\clip(0,0,100,100)\\t(0,1000,\\clip(50,50,150,150))}x');
    const trs = p.fragments[0].ops.filter((o): o is Transition => o.type === 't');
    expect(clipAt(p.lineTags.clip, trs, 500, 1000)?.rect).toEqual([25, 25, 125, 125]);
  });
});

describe('karaoke', () => {
  it('accumulates syllable times from \\k durations (centiseconds)', () => {
    const p = parseText('{\\k20}ka{\\k30}ra{\\kf50}o{\\ko10}ke');
    expect(p.fragments.map((f) => [f.karaoke!.type, f.karaoke!.start, f.karaoke!.duration])).toEqual([
      ['k', 0, 200], ['k', 200, 300], ['kf', 500, 500], ['ko', 1000, 100],
    ]);
  });

  it('skips durations of \\k without text, honours \\kt and maps \\K to kf', () => {
    const p = parseText('{\\k10\\k20}a{\\kt100\\K40}b');
    expect(p.fragments[0].karaoke).toMatchObject({ start: 100, duration: 200 });
    expect(p.fragments[1].karaoke).toMatchObject({ type: 'kf', start: 1000, duration: 400 });
  });

  it('splits a \\kf syllable across fragments by text length', () => {
    const p = parseText('{\\kf100}abc{\\b1}d{\\kf50}e');
    expect(p.fragments.map((f) => [f.karaoke!.start, f.karaoke!.duration])).toEqual([[0, 750], [750, 250], [1000, 500]]);
  });

  it('reports fill and outline phases', () => {
    expect(karaokePhase({ type: 'k', start: 100, duration: 100, syllable: 0 }, 99).fill).toBe(0);
    expect(karaokePhase({ type: 'k', start: 100, duration: 100, syllable: 0 }, 100).fill).toBe(1);
    expect(karaokePhase({ type: 'kf', start: 100, duration: 200, syllable: 0 }, 150).fill).toBe(0.25);
    expect(karaokePhase({ type: 'ko', start: 100, duration: 100, syllable: 0 }, 50)).toEqual({ fill: 0, outline: false });
  });
});
