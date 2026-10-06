import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { create } from '../src/index';
import type { Box } from '../src/layout/Collision';
import { inflate, stackDirection, takesPartInStacking } from '../src/layout/Stacking';
import { parseText } from '../src/parser/TextParser';

describe('stacking rules (pure)', () => {
  it('only plain lines take part; \\pos \\move \\org and any \\t are exempt', () => {
    const lt = (t: string) => parseText(t).lineTags;
    expect(takesPartInStacking(lt('x'), false)).toBe(true);
    expect(takesPartInStacking(lt('{\\pos(1,2)}x'), false)).toBe(false);
    expect(takesPartInStacking(lt('{\\move(1,2,3,4)}x'), false)).toBe(false);
    expect(takesPartInStacking(lt('{\\org(1,2)}x'), false)).toBe(false);
    expect(takesPartInStacking(lt('{\\fad(1,2)}x'), true)).toBe(false);
    expect(takesPartInStacking(lt('{\\fad(1,2)}x'), false)).toBe(true);
  });

  it('bottom aligned lines move up; top and middle aligned lines move down', () => {
    expect([1, 2, 3].map(stackDirection)).toEqual([-1, -1, -1]);
    expect([4, 5, 6, 7, 8, 9].map(stackDirection)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('the outline counts on every side of the rectangle', () => {
    const b: Box = { left: 10, right: 20, top: 30, bottom: 40 };
    expect(inflate(b, 5)).toEqual({ left: 5, right: 25, top: 25, bottom: 45 });
    expect(inflate(b, 0)).toBe(b);
  });
});

const H = 50;
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => H });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 100 });
});
afterEach(() => { document.body.innerHTML = ''; });

/** Anchor y (layout px) of every line, in DOM order, for events at t = 1 s. */
const anchors = (events: string[], styleAn = 2): number[] => {
  const c = document.createElement('div');
  Object.defineProperty(c, 'clientWidth', { value: 640 });
  Object.defineProperty(c, 'clientHeight', { value: 360 });
  document.body.appendChild(c);
  const text = `[Script Info]\nPlayResX: 640\nPlayResY: 360\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, Outline, Shadow, Alignment, MarginL, MarginR, MarginV\nStyle: Default,Arial,20,0,0,${styleAn},10,10,10\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.map((e) => `Dialogue: ${e}`).join('\n')}\n`;
  const par = create({ container: c, subtitle: text, region: 'container' });
  par.renderAt(1);
  const tops = Array.from(c.querySelectorAll<HTMLElement>('.par-line')).map((l) => {
    const plate = Array.from(l.querySelectorAll<HTMLElement>('*')).find((e) => e.style.top !== '' && e.style.maxWidth !== '')!;
    return parseFloat(plate.style.top);
  });
  par.destroy();
  return tops;
};
const ev = (text: string, layer = 0) => `${layer},0:00:00.00,0:00:05.00,Default,,0,0,0,,${text}`;

describe('collision stacking in the renderer', () => {
  it('plain bottom lines stack upwards', () => {
    expect(anchors([ev('a'), ev('b')])).toEqual([350, 300]);
  });
  it('different layers do not collide', () => {
    expect(anchors([ev('a'), ev('b', 1)])).toEqual([350, 350]);
  });
  it('\\t and \\org lines are exempt: they stay on top of the first line', () => {
    expect(anchors([ev('a'), ev('{\\t(0,1,\\fscx100)}b')])).toEqual([350, 350]);
    expect(anchors([ev('a'), ev('{\\org(100,100)}b')])).toEqual([350, 350]);
    expect(anchors([ev('a'), ev('{\\pos(100,100)}b')])[1]).toBe(100);
  });
  it('middle aligned lines stack downwards', () => {
    const [a, b] = anchors([ev('{\\an5}a'), ev('{\\an5}b')]);
    expect(b - a).toBe(H);
    const [c, d] = anchors([ev('{\\an4}a'), ev('{\\an4}b')]);
    expect(d - c).toBe(H);
  });
  it('top aligned lines stack downwards', () => {
    const [a, b] = anchors([ev('{\\an8}a'), ev('{\\an8}b')]);
    expect(b - a).toBe(H);
  });
  it('the border of the first line pushes the second one further', () => {
    const [a, b] = anchors([ev('{\\bord10}a'), ev('b')]);
    expect(a - b).toBe(H + 10);
    const [c, d] = anchors([ev('{\\bord10}a'), ev('{\\bord5}b')]);
    expect(c - d).toBe(H + 10 + 5); // each rectangle carries its own outline
  });
});
