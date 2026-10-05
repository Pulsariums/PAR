import { describe, expect, it } from 'vitest';

import { parseDrawing } from '../src/parser/DrawingParser';
import { parseText } from '../src/parser/TextParser';
import { clipPathCss } from '../src/render/clipCss';
import { drawingToPath } from '../src/render/drawingPath';

const tags = (text: string) => parseText(text).lineTags;

describe('line tag precedence (libass)', () => {
  it('keeps the first \\pos, across and within blocks', () => {
    expect(tags('{\\pos(1,2)\\pos(3,4)}a{\\pos(5,6)}b').pos).toEqual([1, 2]);
  });

  it('shares one flag between \\pos and \\move', () => {
    expect(tags('{\\move(0,0,10,10)\\pos(5,5)}a')).toMatchObject({ move: [0, 0, 10, 10] });
    expect(tags('{\\move(0,0,10,10)\\pos(5,5)}a').pos).toBeUndefined();
    expect(tags('{\\pos(5,5)}a{\\move(0,0,10,10)}').move).toBeUndefined();
  });

  it('keeps the first \\an / \\a and the first \\org', () => {
    expect(tags('{\\an8\\an2}a').an).toBe(8);
    expect(tags('{\\a6\\an2}a').an).toBe(8);
    expect(tags('{\\org(1,1)}a{\\org(2,2)}').org).toEqual([1, 1]);
  });

  it('keeps the first \\fad/\\fade', () => {
    expect(tags('{\\fad(100,200)\\fad(300,400)}a').fad).toEqual([100, 200]);
    expect(tags('{\\fade(255,0,255,0,1,2,3)\\fad(1,1)}a')).toMatchObject({ fade: [255, 0, 255, 0, 1, 2, 3] });
  });

  it('keeps the last \\clip/\\iclip and the last \\q', () => {
    expect(tags('{\\clip(0,0,1,1)}a{\\iclip(10,20,0,0)\\q2}b{\\q1}')).toMatchObject({
      clip: { inverse: true, rect: [0, 0, 10, 20] },
      q: 1,
    });
  });

  it('ignores line tags with invalid argument counts', () => {
    expect(tags('{\\pos(1)\\pos(7,8)\\an0\\an3}a')).toMatchObject({ pos: [7, 8], an: 3 });
  });

  it('parses vector clips with an optional scale', () => {
    expect(tags('{\\clip(m 0 0 l 10 0 10 10)}a').clip).toEqual({ inverse: false, drawing: 'm 0 0 l 10 0 10 10', scale: 1 });
    expect(tags('{\\iclip(2,m 0 0 l 8 0 8 8)}a').clip).toMatchObject({ inverse: true, scale: 2 });
  });
});

describe('drawings', () => {
  it('parses compact and repeated coordinates', () => {
    expect(parseDrawing('m0 0l10 0 10 10b 1 2 3 4 5 6 c')).toEqual([
      { cmd: 'm', pts: [[0, 0]] },
      { cmd: 'l', pts: [[10, 0]] },
      { cmd: 'l', pts: [[10, 10]] },
      { cmd: 'b', pts: [[1, 2], [3, 4], [5, 6]] },
      { cmd: 'c', pts: [] },
    ]);
  });

  it('produces a non-empty SVG path (regression: drawings rendered empty)', () => {
    const d = drawingToPath(parseDrawing('m 0 0 l 100 0 100 100 0 100'));
    expect(d).toBe('M 0 0 L 100 0 L 100 100 L 0 100');
    expect(drawingToPath(parseDrawing('m 0 0 l 8 8'), 3)).toBe('M 0 0 L 2 2');
    expect(drawingToPath(parseDrawing('m 0 0 s 10 0 10 10 0 10 c'))).toMatch(/^M 0 0 L .* C .* Z$/);
  });

  it('builds clip-path CSS for rect, inverse and vector clips', () => {
    expect(clipPathCss({ inverse: false, rect: [1, 2, 3, 4] })).toBe('path("M 1 2 H 3 V 4 H 1 Z")');
    expect(clipPathCss({ inverse: true, rect: [1, 2, 3, 4] })).toMatch(/^path\(evenodd, "M -1000000 .* M 1 2 H 3 V 4 H 1 Z"\)$/);
    expect(clipPathCss({ inverse: false, drawing: 'm 0 0 l 4 0 4 4', scale: 2 })).toBe('path("M 0 0 L 2 0 L 2 2 Z")');
    expect(clipPathCss(undefined)).toBe('none');
  });
});
