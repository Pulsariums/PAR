import { describe, expect, it } from 'vitest';

import { drawingToPath } from '../src/render/drawingPath';
import { MAX_DRAWING_COORD, MAX_DRAWING_POINTS, parseDrawing } from '../src/parser/DrawingParser';
import { parseScript } from '../src/parser/ScriptParser';
import { parseText } from '../src/parser/TextParser';
import { parseNum } from '../src/parser/TagValues';

/** Wall time of `fn` in ms. The old quadratic code needed 6 s and 13 s for the first two cases; the limit is generous. */
const time = (fn: () => void): number => {
  const t = performance.now();
  fn();
  return performance.now() - t;
};
const LIMIT = 1500;

describe('parser stays linear on hostile input', () => {
  it("'{' x 80k", () => {
    let frags = 0;
    expect(time(() => { frags = parseText('{'.repeat(80_000) + 'x').fragments.length; })).toBeLessThan(LIMIT);
    expect(frags).toBe(1);
  });
  it("'{\\b1}' x 80k with no text in between", () => {
    let n = 0;
    expect(time(() => { n = parseText('{\\b1}'.repeat(80_000) + 'x').fragments[0].ops.length; })).toBeLessThan(LIMIT);
    expect(n).toBe(80_000);
  });
  it("'{}' x 80k and '}' x 80k and '\\{' x 80k", () => {
    expect(time(() => parseText('{}'.repeat(80_000) + 'x'))).toBeLessThan(LIMIT);
    expect(time(() => parseText('}'.repeat(80_000)))).toBeLessThan(LIMIT);
    expect(time(() => parseText('\\{'.repeat(80_000)))).toBeLessThan(LIMIT);
  });
  it('80k karaoke blocks, nested \\t( and unclosed \\pos(', () => {
    expect(time(() => parseText('{\\k1}a'.repeat(80_000)))).toBeLessThan(LIMIT);
    expect(time(() => parseText('{' + '\\t('.repeat(80_000) + '}x'))).toBeLessThan(LIMIT);
    expect(time(() => parseText('{' + '\\pos('.repeat(80_000) + '}x'))).toBeLessThan(LIMIT);
  });
  it('a script with 5k hostile events', () => {
    const line = 'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,' + '{\\b1}'.repeat(200) + 'x';
    const text = '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' + Array(5_000).fill(line).join('\n');
    let n = 0;
    expect(time(() => { n = parseScript(text).events.length; })).toBeLessThan(5000);
    expect(n).toBe(5_000);
  });
});

describe('non-finite numbers and drawing caps', () => {
  it('parseNum never returns Infinity or NaN', () => {
    expect(parseNum('1e999')).toBeNull();
    expect(parseNum('-1e999')).toBeNull();
  });
  it('drawing coordinates are clamped and finite', () => {
    const d = parseDrawing('m 1e999 -1e999 l 5 5');
    expect(d[0].pts[0]).toEqual([MAX_DRAWING_COORD, -MAX_DRAWING_COORD]);
    expect(drawingToPath(d)).not.toMatch(/NaN|Infinity/);
  });
  it('points beyond the cap are dropped and parsing stays fast', () => {
    const pts = Array.from({ length: 400_000 }, (_, i) => `${i} ${i}`).join(' ');
    let n = 0;
    expect(time(() => { n = parseDrawing('m 0 0 l ' + pts).reduce((a, c) => a + c.pts.length, 0); })).toBeLessThan(LIMIT);
    expect(n).toBeLessThanOrEqual(MAX_DRAWING_POINTS);
    expect(n).toBeGreaterThan(MAX_DRAWING_POINTS - 10);
  });
  it('a drawing below the cap is unchanged', () => {
    expect(parseDrawing('m 0 0 l 10 0 10 10 b 1 1 2 2 3 3 c').map((c) => c.cmd)).toEqual(['m', 'l', 'l', 'b', 'c']);
  });
});
