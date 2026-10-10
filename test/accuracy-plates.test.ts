import { afterEach, describe, expect, it } from 'vitest';

import { isPlated } from '../src/anim/plated';
import { create } from '../src/index';
import { parseScript } from '../src/parser/ScriptParser';
import { drawingToPath } from '../src/render/drawingPath';
import { parseDrawing } from '../src/parser/DrawingParser';

const script = (events: string[], style = 'Style: Default,Arial,40,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,0,2,10,10,10,1') =>
  [
    '[Script Info]', 'PlayResX: 640', 'PlayResY: 360', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    style, '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events.map((t) => `Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,${t}`),
  ].join('\n');

const container = () => {
  const c = document.createElement('div');
  Object.defineProperty(c, 'clientWidth', { value: 640 });
  Object.defineProperty(c, 'clientHeight', { value: 360 });
  document.body.appendChild(c);
  return c;
};

const render = (ass: string) => {
  const par = create({ container: container(), subtitle: ass });
  par.renderAt(1);
  return par;
};

const boxes = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('.par-box'));
const frag = (box: HTMLElement) => box.querySelector<HTMLElement>('.par-frag')!;

/** The `stdDeviation` of the SVG blur filter an element's `filter: url(#..)` points at (all DOM `\blur` is an sRGB SVG filter). */
const svgBlur = (root: HTMLElement, el: HTMLElement): string => {
  const id = /url\("?#(par-blur-\d+)"?\)/.exec(el.style.filter)?.[1];
  if (!id) throw new Error(`no SVG blur filter on ${el.style.filter}`);
  return root.querySelector(`filter[id="${id}"] feGaussianBlur`)!.getAttribute('stdDeviation')!;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('plates: when a line gets shadow/outline/fill copies', () => {
  const parsed = (events: string[], style?: string) => {
    const s = parseScript(script(events, style));
    return isPlated(s.events[0], s.styles.get('Default')!, s.styles);
  };

  it('plates a border with blur or \\be, or a translucent fill', () => {
    expect(parsed(['{\\blur2}x'])).toBe(true);
    expect(parsed(['{\\be1}x'])).toBe(true);
    expect(parsed(['{\\t(0,100,\\blur5)}x'])).toBe(true);
    expect(parsed(['{\\1a&H80&}x'])).toBe(true);
    expect(parsed(['x'])).toBe(false);
    expect(parsed(['{\\fad(100,100)}x'])).toBe(false);
  });

  it('does not plate without a border or with BorderStyle 3', () => {
    expect(parsed(['{\\bord0\\blur3}x'], 'Style: Default,Arial,40,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,2,10,10,10,1')).toBe(false);
    expect(parsed(['{\\blur3}x'], 'Style: Default,Arial,40,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,3,3,0,2,10,10,10,1')).toBe(false);
  });
});

describe('plates: DOM structure', () => {
  it('draws shadow, outline and fill as three full copies, fill on top', () => {
    const par = render(script(['{\\blur2\\shad2}Hello']));
    const [shadow, outline, fill] = boxes(par.element);
    expect(boxes(par.element)).toHaveLength(3);
    for (const b of [shadow, outline, fill]) expect(frag(b).textContent).toBe('Hello');
    expect(frag(shadow).style.visibility).toBe('visible');
    expect(frag(shadow).style.left).toBe('2px');
    expect(frag(outline).style.getPropertyValue('-webkit-text-stroke-width')).toBe('6px');
    // fill stays sharp next to a border; the outline and the shadow are blurred (sRGB SVG filter, sigma = 2 * 0.8493)
    expect(frag(fill).style.filter).toBe('none');
    expect(svgBlur(par.element, frag(outline))).toBe('1.699');
    expect(svgBlur(par.element, frag(shadow))).toBe('1.699');
  });

  it('blurs the fill when there is no border, in a single element', () => {
    const par = render(script(['{\\bord0\\blur3}Hello']));
    expect(boxes(par.element)).toHaveLength(1);
    expect(svgBlur(par.element, frag(boxes(par.element)[0]))).toBe('2.548');
  });

  it('keeps one element for plain bordered text', () => {
    const par = render(script(['Hello']));
    expect(boxes(par.element)).toHaveLength(1);
    expect(frag(boxes(par.element)[0]).style.getPropertyValue('-webkit-text-stroke-width')).toBe('6px');
  });

  it('cuts the glyph out of the outline for a translucent fill (SVG carve filter)', () => {
    const par = render(script(['{\\1a&H80&\\blur2}Hello']));
    const outline = boxes(par.element)[1];
    const id = /url\("?#(par-carve-\d+)"?\)/.exec(frag(outline).style.filter)?.[1];
    expect(id).toBeTruthy();
    const filter = par.element.querySelector(`filter[id="${id}"]`)!;
    expect(filter.querySelector('feGaussianBlur')!.getAttribute('stdDeviation')).toBe('1.699');
    expect(frag(outline).style.color).toBe('rgb(255, 0, 0)');
  });

  it('hides the shadow plate without a shadow, the outline plate without a border', () => {
    const par = render(script(['{\\bord0\\shad0\\blur2\\1a&H80&}Hello'], 'Style: Default,Arial,40,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,0,2,10,10,10,1'));
    // no border => not plated at all
    expect(boxes(par.element)).toHaveLength(1);
    const par2 = render(script(['{\\blur2}Hello']));
    expect(frag(boxes(par2.element)[0]).style.visibility).toBe('hidden');
  });

  it('keeps BorderStyle 3 as one element and blurs box and text together', () => {
    const style = 'Style: Default,Arial,40,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,3,3,0,2,10,10,10,1';
    const par = render(script(['{\\blur2}Hello'], style));
    expect(boxes(par.element)).toHaveLength(1);
    expect(svgBlur(par.element, frag(boxes(par.element)[0]))).toBe('1.699');
  });

  it('blurs stretched text round on screen (SVG blur with one sigma per axis)', () => {
    const par = render(script(['{\\bord0\\blur4\\fscx200}Hello']));
    const f = frag(boxes(par.element)[0]);
    const id = /url\("?#(par-blur-\d+)"?\)/.exec(f.style.filter)?.[1];
    expect(id).toBeTruthy();
    expect(par.element.querySelector(`filter[id="${id}"] feGaussianBlur`)!.getAttribute('stdDeviation')).toBe('1.699 3.397');
  });

  it('publishes layout units per device pixel for \\be on the stage', () => {
    const par = render(script(['{\\be2}Hello']));
    const stage = par.element.querySelector<HTMLElement>('.par-stage')!;
    expect(stage.style.getPropertyValue('--par-u')).toBe('1');
  });
});

describe('drawings', () => {
  it('closes the last contour so the outline has no gap (libass closes it)', () => {
    expect(drawingToPath(parseDrawing('m 0 0 l 10 0 10 10 0 10'))).toBe('M 0 0 L 10 0 L 10 10 L 0 10 Z');
    expect(drawingToPath(parseDrawing('m 0 0 l 10 0 m 20 0 l 30 0'))).toBe('M 0 0 L 10 0 Z M 20 0 L 30 0 Z');
  });

  it('sizes the box by the control-point box (width, height), origin at its top-left', () => {
    const par = render(script(['{\\an7\\pos(0,0)\\p1\\bord0}m 10 -50 b 50 -50 100 50 100 0 l 100 60 10 60']));
    const svg = par.element.querySelector<SVGElement>('svg')!;
    expect(svg.style.width).toBe('90px');
    expect(svg.style.height).toBe('110px');
  });

  // libass anchors a drawing by the min corner of its control-point box, not by the raw (0,0): the path is shifted by -min so the ink
  // fills the box (the ReZero E06 bar `m -24 -176 ...` was 24px left and 176px high without this). See `FragmentView.origin`.
  it('shifts the path by the bounding-box min so the ink fills the box for any alignment', () => {
    for (const an of ['an2', 'an5', 'an7']) {
      const par = render(script([`{\\${an}\\pos(960,1070)\\p1\\bord0}m -24 -176 l 1520 -176 1520 574 -24 574`]));
      const g = par.element.querySelector<SVGElement>('svg > g')!;
      expect(g.getAttribute('transform')).toContain('translate(24 176)');
    }
  });

  it('leaves a drawing already starting at (0,0) unshifted', () => {
    const par = render(script(['{\\an5\\pos(320,180)\\p1\\bord0}m 0 0 l 40 0 40 40 0 40']));
    const g = par.element.querySelector<SVGElement>('svg > g')!;
    expect(g.getAttribute('transform')).toContain('translate(0 0)');
  });
});
