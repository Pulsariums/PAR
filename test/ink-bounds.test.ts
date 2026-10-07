import { describe, expect, it } from 'vitest';

import { inkBounds } from '../src/canvas/raster';
import type { PlateSpec, SpriteSpec } from '../src/canvas/types';

const plate = (over: Partial<PlateSpec> = {}): PlateSpec => ({ fill: 'rgb(255,255,255)', stroke: null, strokeW: 0, dx: 0, dy: 0, blur: 0, carve: false, shadow: null, ...over });
const spec = (plates: PlateSpec[], rx = 1): SpriteSpec => ({ text: 'a', family: 'x', weight: 400, italic: false, size: 40, ratio: 1, rx, spacing: 0, kerning: false, plates, scale: 1 });
const tm = (o: Partial<Record<'actualBoundingBoxLeft' | 'actualBoundingBoxRight' | 'actualBoundingBoxAscent' | 'actualBoundingBoxDescent', number>>): TextMetrics => o as unknown as TextMetrics;

describe('sprite bounds', () => {
  const baseline = 32;
  const ink = tm({ actualBoundingBoxLeft: -2, actualBoundingBoxRight: 18, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 0 });

  it('covers the measured ink, not the whole line box', () => {
    const b = inkBounds(spec([plate()]), ink, baseline, 20);
    expect(b).toEqual({ x0: 2, y0: 12, x1: 18, y1: 32 });
    expect(b.y1 - b.y0).toBeLessThan(40);
  });

  it('grows by stroke, offset, shadow and 3 sigma of blur, and scales x with the horizontal ratio', () => {
    const b = inkBounds(spec([plate({ strokeW: 4, blur: 2, dx: 3, dy: 1, shadow: { dx: 2, dy: 2, colour: 'rgb(0,0,0)' } })]), ink, baseline, 20);
    // x: ink 2..18, offsets 3..5, half stroke 2, blur 6
    expect(b.x0).toBe(2 + 3 - 2 - 6);
    expect(b.x1).toBe(18 + 5 + 2 + 6);
    // y: ink 12..32, offsets 1..3, half stroke 2, blur 6
    expect(b.y0).toBe(12 + 1 - 2 - 6);
    expect(b.y1).toBe(32 + 3 + 2 + 6);
    const wide = inkBounds(spec([plate()], 2), ink, baseline, 40);
    expect([wide.x0, wide.x1]).toEqual([4, 36]);
  });

  it('takes the union of all plates', () => {
    const b = inkBounds(spec([plate({ blur: 0 }), plate({ blur: 4, strokeW: 2 })]), ink, baseline, 20);
    expect(b.x0).toBe(2 - 1 - 12);
    expect(b.y1).toBe(32 + 1 + 12);
  });

  it('falls back to the whole line box when the browser reports no ink metrics', () => {
    const b = inkBounds(spec([plate()]), tm({}), baseline, 24);
    expect(b).toEqual({ x0: 0, y0: 0, x1: 24, y1: 40 });
  });
});
