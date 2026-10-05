import { describe, expect, it } from 'vitest';

import { alignX, alignY, marginAnchor, maxTextWidth } from '../src/layout/Anchor';
import { collisionShift } from '../src/layout/Collision';
import { resolveLayoutSize, stageTransform } from '../src/layout/Layout';
import { fitRect, resolveRegion, type RegionInput } from '../src/layout/Region';
import { parseScript } from '../src/parser/ScriptParser';

const box = { x: 0, y: 0, width: 1000, height: 1000 };

describe('region / letterbox math', () => {
  it('letterboxes with object-fit: contain', () => {
    expect(fitRect(box, 1920, 1080, 'contain')).toEqual({ x: 0, y: 218.75, width: 1000, height: 562.5 });
    const r = fitRect({ x: 10, y: 0, width: 400, height: 100 }, 4, 3, 'contain');
    expect(r.x).toBeCloseTo(143.3333);
    expect(r.width).toBeCloseTo(133.3333);
    expect([r.y, r.height]).toEqual([0, 100]);
  });

  it('overflows with cover, keeps intrinsic size with none, never upscales with scale-down', () => {
    const c = fitRect(box, 1920, 1080, 'cover');
    expect(c.x).toBeCloseTo(-388.8889);
    expect(c.width).toBeCloseTo(1777.7778);
    expect([c.y, c.height]).toEqual([0, 1000]);
    expect(fitRect(box, 640, 360, 'none')).toEqual({ x: 180, y: 320, width: 640, height: 360 });
    expect(fitRect(box, 640, 360, 'scale-down')).toEqual({ x: 180, y: 320, width: 640, height: 360 });
    expect(fitRect(box, 1920, 1080, 'fill')).toEqual(box);
  });

  it('uses the whole box while the intrinsic size is unknown', () => {
    expect(fitRect(box, 0, 0, 'contain')).toEqual(box);
  });

  it('resolves the region option', () => {
    const input: RegionInput = {
      containerWidth: 800, containerHeight: 600, videoBox: { x: 0, y: 0, width: 800, height: 600 },
      videoWidth: 1600, videoHeight: 900, objectFit: 'contain',
    };
    expect(resolveRegion('video', input)).toEqual({ x: 0, y: 75, width: 800, height: 450 });
    expect(resolveRegion('container', input)).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(resolveRegion({ x: 1, y: 2, width: 3, height: 4 }, input)).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(resolveRegion('video', { ...input, videoBox: null })).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });
});

describe('layout scaling', () => {
  const info = parseScript('[Script Info]\nPlayResX: 1280\nPlayResY: 720\nScaledBorderAndShadow: no').info;

  it('uses PlayRes by default and an explicit size when given', () => {
    expect(resolveLayoutSize('script', info)).toEqual({ width: 1280, height: 720 });
    expect(resolveLayoutSize({ width: 1920, height: 1080 }, info)).toEqual({ width: 1920, height: 1080 });
    expect(resolveLayoutSize('script', null)).toEqual({ width: 384, height: 288 });
  });

  it('maps layout units to region pixels and handles ScaledBorderAndShadow', () => {
    const t = stageTransform({ x: 0, y: 0, width: 640, height: 360 }, { width: 1280, height: 720 }, false);
    expect(t).toEqual({ scaleX: 0.5, scaleY: 0.5, borderScale: 2 });
    expect(stageTransform({ x: 0, y: 0, width: 640, height: 360 }, { width: 1280, height: 720 }, true).borderScale).toBe(1);
    // Non-uniform when aspect ratios differ (VSFilter-style stretch).
    expect(stageTransform({ x: 0, y: 0, width: 1920, height: 1080 }, { width: 384, height: 288 }, true)).toMatchObject({ scaleX: 5, scaleY: 3.75 });
  });

  it('computes alignment anchors from margins', () => {
    const size = { width: 1000, height: 500 };
    const m = { l: 10, r: 30, v: 20 };
    expect(marginAnchor(1, m, size)).toEqual([10, 480]);
    expect(marginAnchor(2, m, size)).toEqual([490, 480]);
    expect(marginAnchor(9, m, size)).toEqual([970, 20]);
    expect(marginAnchor(5, m, size)).toEqual([490, 250]);
    expect([alignX(7), alignX(8), alignX(9), alignY(7), alignY(4), alignY(1)]).toEqual([0, 0.5, 1, 0, 0.5, 1]);
    expect(maxTextWidth(m, size)).toBe(960);
  });

  it('stacks colliding lines and keeps lines of other layers independent', () => {
    const placed = [{ layer: 0, box: { left: 0, right: 100, top: 400, bottom: 450 } }];
    const nb = { left: 20, right: 80, top: 410, bottom: 450 };
    expect(collisionShift(nb, 0, -1, placed)).toBe(-50);
    expect(collisionShift(nb, 1, -1, placed)).toBe(0);
    expect(collisionShift({ left: 200, right: 300, top: 400, bottom: 450 }, 0, -1, placed)).toBe(0);
    expect(collisionShift({ left: 0, right: 100, top: 420, bottom: 460 }, 0, 1, placed)).toBe(30);
  });
});
