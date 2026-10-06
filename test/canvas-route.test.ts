import { afterEach, describe, expect, it, vi } from 'vitest';

import { prepareLine } from '../src/anim/Prepared';
import { CanvasPath } from '../src/canvas/CanvasPath';
import { resetCanvasSupport } from '../src/canvas/raster';
import { AUTO_LOAD } from '../src/canvas/eligibility';
import type { RenderMode } from '../src/canvas/types';
import { parseScript } from '../src/parser/ScriptParser';
import { Overlay } from '../src/render/Overlay';

/** A canvas double with the features the capability probe asks for. */
class FakeCanvas {
  constructor(public width: number, public height: number) {}
  getContext() { return { filter: 'none', letterSpacing: '0px', measureText: () => ({ width: 10, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 }) }; }
}
afterEach(() => { vi.unstubAllGlobals(); resetCanvasSupport(); document.body.innerHTML = ''; });

const HEAD = '[Script Info]\nPlayResX: 640\nPlayResY: 360\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
const lines = (n: number, tag = '\\pos(5,5)\\blur2') => {
  const sc = parseScript(HEAD + Array.from({ length: n }, (_v, i) => `Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an5${tag}}${String.fromCharCode(65 + (i % 26))}\n`).join(''));
  return sc.events.map((e) => prepareLine(e, sc.styles, sc.info));
};
const path = (mode: RenderMode) => new CanvasPath(new Overlay(document.body, 1), () => mode, 1 << 20);

describe('canvas routing', () => {
  it("'auto' stays DOM in a light scene and switches a heavy one; a line keeps its path for its whole life", () => {
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    const p = path('auto');
    expect(p.enabled).toBe(true);
    const few = lines(3);
    expect(p.route(few, 1000)).toEqual([false, false, false]);
    const many = lines(AUTO_LOAD + 2); // a plain particle scores 1
    const routed = p.route(many, 1100);
    expect(routed.slice(0, 3)).toEqual([false, false, false]); // these three were already decided (same ids as before)
    expect(routed.slice(3).every(Boolean)).toBe(true);
    // the scene lightens: lines already on the canvas stay there
    expect(p.route(many.slice(3, 5), 1200)).toEqual([true, true]);
  });

  it("'canvas' takes every qualifying line, 'dom' none, and non-qualifying lines never go to the canvas", () => {
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    const mixed = [...lines(2), ...lines(1, '\\pos(1,1)\\frx30')];
    expect(path('canvas').route(mixed, 0)).toEqual([true, true, false]);
    expect(path('dom').route(mixed, 0)).toEqual([false, false, false]);
  });

  it('without canvas support everything is DOM, whatever the mode', () => {
    const p = path('canvas'); // jsdom: no OffscreenCanvas, no 2D context
    expect(p.enabled).toBe(false);
    expect(p.route(lines(5), 0).some(Boolean)).toBe(false);
  });
});
