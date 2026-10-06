import { afterEach, describe, expect, it } from 'vitest';

import { create } from '../src/index';
import { resolveLayout } from '../src/layout/resolve';
import type { DefaultLayoutOption, LayoutOption } from '../src/types/options';
import { parseScript } from '../src/parser/ScriptParser';

const info = (head: string) => parseScript(`[Script Info]\n${head}\n`).info;
const R169 = { width: 1280, height: 720 };
const R43 = { width: 800, height: 600 };

type Row = [string, LayoutOption, string, DefaultLayoutOption, { width: number; height: number } | null, [number, number], string, boolean];
const ROWS: Row[] = [
  // name, option, script header, defaultLayout, region, expected size, source, derived
  ['option wins over script', { width: 800, height: 600 }, 'PlayResX: 1920\nPlayResY: 1080', '720p', R169, [800, 600], 'option', false],
  ['option wins over nothing', { width: 640, height: 360 }, '', 'libass', R169, [640, 360], 'option', false],
  ["'script' option = script rule", 'script', 'PlayResX: 1920\nPlayResY: 1080', '720p', R169, [1920, 1080], 'script', false],
  ['both sides', 'script', 'PlayResX: 640\nPlayResY: 480', 'libass', R169, [640, 480], 'script', false],
  ['keys are case-insensitive', 'script', 'playresx: 800\nPLAYRESY: 450', '720p', R169, [800, 450], 'script', false],
  ['X only, 16:9 region', 'script', 'PlayResX: 1280', '720p', R169, [1280, 720], 'script', true],
  ['X only, 4:3 region', 'script', 'PlayResX: 1280', '720p', R43, [1280, 960], 'script', true],
  ['Y only, 16:9 region', 'script', 'PlayResY: 1080', '720p', R169, [1920, 1080], 'script', true],
  ['Y only, 4:3 region', 'script', 'PlayResY: 480', '720p', R43, [640, 480], 'script', true],
  ['X only, no region -> 16:9', 'script', 'PlayResX: 1920', '720p', null, [1920, 1080], 'script', true],
  ['X only, empty region -> 16:9', 'script', 'PlayResX: 1920', '720p', { width: 0, height: 0 }, [1920, 1080], 'script', true],
  ['X only, custom default does not matter', 'script', 'PlayResX: 1920', { width: 10, height: 10 }, R169, [1920, 1080], 'script', true],
  ['libass X only 640 -> 480', 'script', 'PlayResX: 640', 'libass', R169, [640, 480], 'script', true],
  ['libass X only 1280 -> 1024', 'script', 'PlayResX: 1280', 'libass', R169, [1280, 1024], 'script', true],
  ['libass Y only 480 -> 640', 'script', 'PlayResY: 480', 'libass', R169, [640, 480], 'script', true],
  ['libass Y only 1024 -> 1280', 'script', 'PlayResY: 1024', 'libass', R169, [1280, 1024], 'script', true],
  ['nothing: 720p default', 'script', 'Title: x', '720p', R169, [1280, 720], 'default', false],
  ['nothing: libass preset', 'script', 'Title: x', 'libass', R169, [384, 288], 'default', false],
  ['nothing: custom default', 'script', '', { width: 1000, height: 500 }, R169, [1000, 500], 'default', false],
  ['zero / garbage PlayRes count as absent', 'script', 'PlayResX: 0\nPlayResY: abc', '720p', R169, [1280, 720], 'default', false],
  ['negative PlayResX + valid Y = Y only', 'script', 'PlayResX: -5\nPlayResY: 720', '720p', R169, [1280, 720], 'script', true],
];

describe('layout (virtual) size: resolution order', () => {
  for (const [name, opt, head, def, region, size, source, derived] of ROWS) {
    it(name, () => {
      const r = resolveLayout(opt, info(head), def, region);
      expect([r.size.width, r.size.height]).toEqual(size);
      expect(r.source).toBe(source);
      expect(r.derived).toBe(derived);
    });
  }
  it('no script at all uses the default', () => {
    expect(resolveLayout('script', null, '720p').size).toEqual({ width: 1280, height: 720 });
    expect(resolveLayout('script', null, 'libass')).toMatchObject({ size: { width: 384, height: 288 }, source: 'default' });
  });
});

const box = (w = 960, h = 540) => {
  const c = document.createElement('div');
  Object.defineProperty(c, 'clientWidth', { value: w });
  Object.defineProperty(c, 'clientHeight', { value: h });
  document.body.appendChild(c);
  return c;
};
afterEach(() => { document.body.innerHTML = ''; });

describe('metrics: virtual vs real', () => {
  const ass = (head: string) => `[Script Info]\n${head}\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,hi\n`;

  it('reports layoutSize, regionSize, scale and layoutSource', () => {
    const par = create({ container: box(), subtitle: ass('PlayResX: 1920\nPlayResY: 1080') });
    expect(par.getMetrics()).toMatchObject({ layoutSize: { width: 1920, height: 1080 }, regionSize: { width: 960, height: 540 }, scale: { x: 0.5, y: 0.5 }, layoutSource: 'script', layoutDerived: false });
    par.setOptions({ layout: { width: 480, height: 270 } });
    expect(par.getMetrics()).toMatchObject({ layoutSize: { width: 480, height: 270 }, scale: { x: 2, y: 2 }, layoutSource: 'option' });
    par.destroy();
  });

  it('defaults to 720p without PlayRes and switches with defaultLayout', () => {
    const par = create({ container: box(1280, 720), subtitle: ass('Title: x') });
    expect(par.getMetrics()).toMatchObject({ layoutSize: { width: 1280, height: 720 }, scale: { x: 1, y: 1 }, layoutSource: 'default' });
    par.setOptions({ defaultLayout: 'libass' });
    const m = par.getMetrics();
    expect(m.layoutSize).toEqual({ width: 384, height: 288 });
    expect(m.scale.x).toBeCloseTo(1280 / 384);
    expect(m.scale.y).toBeCloseTo(2.5);
    expect(m.layoutSource).toBe('default');
    par.destroy();
  });

  it('rejects a bad defaultLayout', () => {
    expect(() => create({ container: box(), defaultLayout: { width: 0, height: 5 } })).toThrow(TypeError);
    expect(() => create({ container: box(), defaultLayout: 'x' as never })).toThrow(TypeError);
  });
});
