import { afterEach, describe, expect, it } from 'vitest';

import { clipAt } from '../src/anim/LineAnim';
import { create } from '../src/index';
import { parseClip } from '../src/parser/ClipParser';
import { parseText } from '../src/parser/TextParser';
import { clipPathCss } from '../src/render/clipCss';
import type { Transition } from '../src/types/script';

const tags = (s: string) => parseText(`${s}x`).lineTags;

const script = (text: string) =>
  [
    '[Script Info]', 'PlayResX: 640', 'PlayResY: 360', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Arial,40,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1', '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    `Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,${text}`,
  ].join('\n');

const render = (text: string, t = 1) => {
  const c = document.createElement('div');
  Object.defineProperty(c, 'clientWidth', { value: 640 });
  Object.defineProperty(c, 'clientHeight', { value: 360 });
  document.body.appendChild(c);
  const par = create({ container: c, subtitle: script(text) });
  par.renderAt(t);
  return par;
};

afterEach(() => {
  document.body.innerHTML = '';
});

// libass: ass_parse.c (`complex_tag("clip")`: argtoi32, first vector wins), ass_render.c (`render_glyph`).
describe('clip semantics (libass)', () => {
  it('reads rect corners as truncated integers and does not reorder them', () => {
    expect(parseClip('250.9,160.9,380.9,210.9', false)?.rect).toEqual([250, 160, 380, 210]);
    expect(parseClip('-3.7,10,20,30', false)?.rect).toEqual([-3, 10, 20, 30]);
    expect(parseClip('400,20,260,70', false)?.rect).toEqual([400, 20, 260, 70]);
  });

  it('hides everything for an empty \\clip rect and nothing for an empty \\iclip rect', () => {
    expect(clipPathCss({ inverse: false, rect: [400, 20, 260, 70] })).toBe('path("M 0 0 Z")');
    expect(clipPathCss({ inverse: false, rect: [10, 10, 10, 50] })).toBe('path("M 0 0 Z")');
    expect(clipPathCss({ inverse: true, rect: [400, 20, 260, 70] })).toBe('none');
    expect(clipPathCss({ inverse: false, rect: [0, 0, 5, 5] })).toBe('path("M 0 0 H 5 V 5 H 0 Z")');
  });

  it('keeps the LAST rect clip but the FIRST vector clip, and both apply together', () => {
    const t = tags('{\\clip(0,0,1,1)\\clip(5,5,9,9)\\clip(m 0 0 l 4 0 4 4)\\iclip(m 1 1 l 2 1 2 2)}a{\\clip(7,7,8,8)\\clip(m 9 9 l 8 8 7 9)}');
    expect(t.clip).toEqual({ inverse: false, rect: [7, 7, 8, 8] });
    expect(t.vclip).toEqual({ inverse: false, drawing: 'm 0 0 l 4 0 4 4', scale: 1 });
  });

  it('truncates the vector clip scale and keeps it at least 1', () => {
    expect(parseClip('2.9,m 0 0 l 1 1', false)?.scale).toBe(2);
    expect(parseClip('0,m 0 0 l 1 1', false)?.scale).toBe(1);
  });

  it('animates \\t(\\clip) from the whole script area when there is no rect clip, in integer steps', () => {
    const tr: Transition = { type: 't', t1: 0, t2: 1000, accel: 1, ops: [], clip: [100, 100, 300, 300.9 | 0] };
    const full: [number, number, number, number] = [0, 0, 640, 360];
    expect(clipAt(undefined, [tr], 500, 1000, full)?.rect).toEqual([50, 50, 470, 330]);
    expect(clipAt(undefined, [tr], 500, 1000)).toBeUndefined();
    const withClip = clipAt({ inverse: true, rect: [0, 0, 11, 11] }, [{ ...tr, clip: [1, 1, 2, 2] }], 500, 1000);
    expect(withClip).toEqual({ inverse: true, rect: [0, 0, 6, 6] });
  });

  it('clips the whole event in script coordinates: it does not follow \\pos, \\move or rotation', () => {
    const a = render('{\\an5\\pos(100,100)\\frz30\\clip(10,20,200,120)}x');
    const b = render('{\\an5\\pos(500,300)\\frz-45\\org(0,0)\\clip(10,20,200,120)}x');
    const root = (p: ReturnType<typeof render>) => p.element.querySelector<HTMLElement>('.par-line')!;
    expect(root(a).style.clipPath).toBe(root(b).style.clipPath);
    expect(root(a).style.clipPath).toContain('M 10 20 H 200 V 120 H 10 Z');
    // the rotated layer is a child of the clipped root
    expect(root(a).querySelector('.par-layer')!.parentElement).toBe(root(a));
  });

  it('puts a vector clip on its own un-rotated wrapper next to a rect clip', () => {
    const par = render('{\\clip(0,0,320,360)\\clip(m 0 0 l 100 0 100 100)\\frz20}x');
    const line = par.element.querySelector<HTMLElement>('.par-line')!;
    const wrap = line.querySelector<HTMLElement>('.par-vclip')!;
    expect(line.style.clipPath).toContain('M 0 0 H 320 V 360 H 0 Z');
    expect(wrap.style.clipPath).toBe('path("M 0 0 L 100 0 L 100 100 Z")');
    expect(wrap.firstElementChild!.classList.contains('par-layer')).toBe(true);
  });

  it('applies the animated rect clip at the right time', () => {
    const early = render('{\\clip(0,0,100,100)\\t(0,1000,\\clip(0,0,300,100))}x', 0.5);
    expect(early.element.querySelector<HTMLElement>('.par-line')!.style.clipPath).toContain('H 200 V 100');
  });
});
