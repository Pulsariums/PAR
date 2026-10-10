import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasLayer } from '../src/canvas/CanvasLayer';
import type { DrawItem } from '../src/canvas/types';
import { cleanName } from '../src/fonts/resolver';
import { parseFontName } from '../src/parser/TagValues';
import { parseText } from '../src/parser/TextParser';
import { Overlay } from '../src/render/Overlay';
import type { SetOp } from '../src/types/script';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('canvas direct text fallback', () => {
  it('invokes direct fallback and draws via fillText and strokeText when resolved[0][0] is null without throwing', () => {
    const fillText = vi.fn();
    const strokeText = vi.fn();
    const measureText = vi.fn().mockReturnValue({
      width: 60,
      fontBoundingBoxAscent: 16,
      fontBoundingBoxDescent: 4,
    });
    const ctx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      transform: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
      measureText,
      fillText,
      strokeText,
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    const layer = new CanvasLayer(new Overlay(document.body, 1));
    layer.resize({ width: 640, height: 360 }, 1);

    const itm: DrawItem = {
      id: 'fallback-line',
      index: 0,
      layer: 0,
      key: 'missing-sprite',
      spec: {
        text: 'Fallback Text',
        family: 'Arial',
        weight: 700,
        italic: true,
        size: 24,
        ratio: 1,
        rx: 1,
        spacing: 0,
        kerning: true,
        plates: [
          {
            fill: '#ffffff',
            stroke: '#000000',
            strokeW: 2,
            dx: 0,
            dy: 0,
            blur: 0,
            carve: false,
            shadow: { dx: 2, dy: 2, colour: '#333333' },
          },
        ],
        scale: 1,
      },
      alpha: 0.9,
      anchor: [120, 240],
      org: [120, 240],
      rot: 0,
      size: 24,
      rx: 1,
      ax: 0.5,
      ay: 1,
      shx: 0,
      shy: 0,
      clip: [],
      still: false,
    };

    const runs = [{ layer: 0, index: 0, items: [itm] }];

    expect(() => {
      layer.draw(runs, [[null]], Infinity);
    }).not.toThrow();

    expect(layer.drawn).toBe(1);
    expect(measureText).toHaveBeenCalledWith('Fallback Text');
    expect(strokeText).toHaveBeenCalled();
    expect(fillText).toHaveBeenCalled();
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });
});

describe('font name quote normalization', () => {
  it('normalizes font names with quotes like \\fn"Arial" and \\fn\'Trebuchet MS\' cleanly', () => {
    expect(cleanName('"Arial"')).toBe('Arial');
    expect(cleanName("'Trebuchet MS'")).toBe('Trebuchet MS');
    expect(cleanName('  "Helvetica Neue"  ')).toBe('Helvetica Neue');
    expect(cleanName("@'Meiryo'")).toBe('Meiryo');
    expect(cleanName('@"Arial"')).toBe('Arial');

    expect(parseFontName('"Arial"')).toBe('Arial');
    expect(parseFontName("'Trebuchet MS'")).toBe('Trebuchet MS');
    expect(parseFontName('  "Verdana"  ')).toBe('Verdana');
    expect(parseFontName('""')).toBeNull();
    expect(parseFontName("''")).toBeNull();

    const parsed1 = parseText('{\\fn"Arial"}Hello');
    const fnOp1 = (parsed1.fragments[0].ops as SetOp[]).find((op) => op.key === 'fn');
    expect(fnOp1?.value).toBe('Arial');

    const parsed2 = parseText("{\\fn'Trebuchet MS'}World");
    const fnOp2 = (parsed2.fragments[0].ops as SetOp[]).find((op) => op.key === 'fn');
    expect(fnOp2?.value).toBe('Trebuchet MS');
  });
});
