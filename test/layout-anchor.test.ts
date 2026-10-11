import { describe, expect, it } from 'vitest';

import { create } from '../src/index';
import { resolveOptions } from '../src/core/options';
import { marginAnchor } from '../src/layout/Anchor';
import { resolveLayoutSize } from '../src/layout/Layout';
import { resolveLayout } from '../src/layout/resolve';
import { LineView } from '../src/render/LineView';
import { planLine } from '../src/canvas/plan';
import { prepareLine } from '../src/anim/Prepared';
import { parseScript } from '../src/parser/ScriptParser';

describe('layout anchor and bottomInset', () => {
  const size = { width: 1000, height: 500 };
  const m = { l: 10, r: 30, v: 20 };

  it('marginAnchor computes bottom-aligned positions with bottomInset = 0 by default', () => {
    // Bottom aligned: an = 1, 2, 3 (ay === 1) -> y = 500 - 20 = 480
    expect(marginAnchor(1, m, size)).toEqual([10, 480]);
    expect(marginAnchor(2, m, size)).toEqual([490, 480]);
    expect(marginAnchor(3, m, size)).toEqual([970, 480]);

    // Top aligned: an = 7, 8, 9 (ay === 0) -> y = 20
    expect(marginAnchor(7, m, size)).toEqual([10, 20]);
    expect(marginAnchor(8, m, size)).toEqual([490, 20]);
    expect(marginAnchor(9, m, size)).toEqual([970, 20]);

    // Middle aligned: an = 4, 5, 6 (ay === 0.5) -> y = 250
    expect(marginAnchor(4, m, size)).toEqual([10, 250]);
    expect(marginAnchor(5, m, size)).toEqual([490, 250]);
    expect(marginAnchor(6, m, size)).toEqual([970, 250]);
  });

  it('marginAnchor applies bottomInset only to bottom-aligned lines (ay === 1)', () => {
    const inset = 40;
    // Bottom aligned: y = size.height - m.v - bottomInset = 500 - 20 - 40 = 440
    expect(marginAnchor(1, m, size, inset)).toEqual([10, 440]);
    expect(marginAnchor(2, m, size, inset)).toEqual([490, 440]);
    expect(marginAnchor(3, m, size, inset)).toEqual([970, 440]);

    // Top aligned: ay === 0, unaffected by bottomInset
    expect(marginAnchor(7, m, size, inset)).toEqual([10, 20]);
    expect(marginAnchor(8, m, size, inset)).toEqual([490, 20]);
    expect(marginAnchor(9, m, size, inset)).toEqual([970, 20]);

    // Middle aligned: ay === 0.5, unaffected by bottomInset
    expect(marginAnchor(4, m, size, inset)).toEqual([10, 250]);
    expect(marginAnchor(5, m, size, inset)).toEqual([490, 250]);
    expect(marginAnchor(6, m, size, inset)).toEqual([970, 250]);
  });

  it('marginAnchor picks up bottomInset from size.bottomInset when not passed explicitly', () => {
    const sizeWithInset = { width: 1000, height: 500, bottomInset: 50 };
    expect(marginAnchor(2, m, sizeWithInset)).toEqual([490, 430]);
    // Explicit bottomInset overrides size.bottomInset
    expect(marginAnchor(2, m, sizeWithInset, 10)).toEqual([490, 470]);
  });

  it('resolveOptions resolves and clamps bottomInset', () => {
    const defaultOpts = resolveOptions({ container: document.body });
    expect(defaultOpts.bottomInset).toBe(0);

    const withInset = resolveOptions({ container: document.body, bottomInset: 60 });
    expect(withInset.bottomInset).toBe(60);

    // Clamps negative to 0
    const negative = resolveOptions({ container: document.body, bottomInset: -20 });
    expect(negative.bottomInset).toBe(0);

    // Inherits from prev
    const patched = resolveOptions({}, withInset);
    expect(patched.bottomInset).toBe(60);
  });

  it('resolveLayout and resolveLayoutSize preserve bottomInset from layout options', () => {
    const layOpt = { width: 1280, height: 720, bottomInset: 45 };
    const resolved = resolveLayout(layOpt, null, '1080p');
    expect(resolved.size.bottomInset).toBe(45);

    const size = resolveLayoutSize(layOpt, null);
    expect(size.bottomInset).toBe(45);
  });

  it('planLine and LineView use bottomInset in layout coordinates', () => {
    const script = parseScript(`
[Script Info]
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Bottom Text
`);

    const ev = script.events[0];
    const prep = prepareLine(ev, script.styles, script.info);
    const env = {
      layout: { width: 1280, height: 720, bottomInset: 60 },
      styles: script.styles,
      borderScale: 1,
      blurScale: 1,
      fonts: { resolve: () => ({ family: 'Arial', weight: 400, italic: false, ratio: 1 }) } as never,
    };

    const item = planLine(prep, 0, env, new Set(), { blur: 0 });
    // Alignment 2 = bottom-centre. y should be height (720) - MarginV (20) - bottomInset (60) = 640
    expect(item.anchor[1]).toBe(640);

    const view = new LineView(prep);
    const [, ay] = view.anchorAt(0, env.layout);
    expect(ay).toBe(640);
    view.destroy();
  });

  it('dynamically shifting bottomInset via setOptions relayouts and shifts bottom lines', () => {
    const script = `
[Script Info]
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Bottom Text
`;
    const c = document.createElement('div');
    Object.defineProperty(c, 'clientWidth', { value: 1280 });
    Object.defineProperty(c, 'clientHeight', { value: 720 });
    document.body.appendChild(c);

    const par = create({ container: c, subtitle: script, renderMode: 'dom' });
    par.renderAt(1.0);

    const box = par.element.querySelector<HTMLElement>('.par-line .par-box')!;
    expect(box).toBeTruthy();
    // Default: anchor Y = 720 - 20 = 700
    expect(box.style.top).toBe('700px');

    // Change bottomInset dynamically to 80
    par.setOptions({ bottomInset: 80 });
    const boxAfter = par.element.querySelector<HTMLElement>('.par-line .par-box')!;
    // Anchor Y = 720 - 20 - 80 = 620
    expect(boxAfter.style.top).toBe('620px');

    // Reset bottomInset back to 0
    par.setOptions({ bottomInset: 0 });
    const boxReset = par.element.querySelector<HTMLElement>('.par-line .par-box')!;
    expect(boxReset.style.top).toBe('700px');

    par.destroy();
    c.remove();
  });
});
