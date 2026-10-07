import { describe, expect, it } from 'vitest';

import { parseDrawing, rectOfDrawing } from '../src/parser/DrawingParser';
import { clipShape } from '../src/render/clipCss';
import type { ClipSpec } from '../src/types/script';

const rect = (d: string) => rectOfDrawing(parseDrawing(d));

describe('rectOfDrawing', () => {
  it('recognises an axis-aligned rectangle from any corner and either winding, closed or not', () => {
    expect(rect('m 10 20 l 50 20 50 40 10 40')).toEqual([10, 20, 50, 40]);
    expect(rect('m 10 20 l 50 20 50 40 10 40 10 20')).toEqual([10, 20, 50, 40]);
    expect(rect('m 50 40 l 10 40 10 20 50 20')).toEqual([10, 20, 50, 40]);
    expect(rect('m 10 20 l 10 40 50 40 50 20')).toEqual([10, 20, 50, 40]);
  });

  it('rejects everything that is not one rectangle', () => {
    expect(rect('m 0 0 l 10 0 10 10')).toBeNull(); // triangle
    expect(rect('m 0 0 l 10 0 12 10 0 10')).toBeNull(); // trapezoid
    expect(rect('m 0 0 l 10 5 20 0 10 -5')).toBeNull(); // diamond
    expect(rect('m 0 0 l 10 0 10 10 0 10 m 20 20 l 30 20 30 30 20 30')).toBeNull(); // two contours
    expect(rect('m 0 0 b 5 0 10 5 10 10 l 0 10')).toBeNull(); // curve
    expect(rect('m 5 5 l 5 5 5 5 5 5')).toBeNull(); // degenerate
    expect(rect('')).toBeNull();
  });
});

describe('clipShape', () => {
  const vec = (drawing: string, extra: Partial<ClipSpec> = {}): ClipSpec => ({ drawing, ...extra }) as ClipSpec;

  it('turns a rectangle written as a vector clip into a rect clip (cheap on the canvas)', () => {
    const s = clipShape(vec('m 1139 35 l 1190 35 1190 58 1139 58'));
    expect(s?.rect).toEqual([1139, 35, 1190, 58]);
    expect(s?.d).toContain('M');
  });

  it('keeps real polygons as paths with a bounding box, and inverse clips as holes', () => {
    const tri = clipShape(vec('m 0 0 l 10 0 10 10'));
    expect(tri?.rect).toBeUndefined();
    expect(tri?.bbox).toEqual([0, 0, 10, 10]);
    const inv = clipShape(vec('m 0 0 l 10 0 10 10 0 10', { inverse: true }));
    expect(inv?.rect).toBeUndefined();
    expect(inv?.evenodd).toBe(true);
  });
});
