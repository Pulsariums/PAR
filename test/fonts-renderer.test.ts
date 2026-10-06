import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { create } from '../src/index';
import { buildTestFont, buildTestTtc } from '../src/fonts/testFont';
import { uuencode } from '../src/fonts/uudecode';

import { FakeHost } from './helpers/fakeFonts';

/** Installs FontFace + document.fonts doubles that route into one FakeHost. */
const installHost = (host: FakeHost) => {
  class FF {
    private inner;
    constructor(family: string, data: ArrayBuffer, d: { weight: string; style: string }) {
      this.inner = host.create(family, data, Number(d.weight), d.style === 'italic');
    }
    load() { return this.inner.load(); }
  }
  vi.stubGlobal('FontFace', FF);
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add: (f: never) => host.add(f), delete: (f: never) => host.remove(f) } });
};

const container = (w = 960, h = 540) => {
  const c = document.createElement('div');
  Object.defineProperty(c, 'clientWidth', { value: w });
  Object.defineProperty(c, 'clientHeight', { value: h });
  document.body.appendChild(c);
  return c;
};

const script = (font: string, extra = '', b = 0) => [
  '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 384', 'PlayResY: 288', '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  `Style: Default,${font},20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,${b},0,0,0,100,100,0,0,1,2,0,2,10,10,10,1`, '',
  extra,
  '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Hello',
  'Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\fnOther Font}World',
].join('\n');

const embed = (name: string, bytes: Uint8Array) => ['[Fonts]', `fontname: ${name}`, ...uuencode(bytes), ''].join('\n');
const lines = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('.par-line'));

let host: FakeHost;
beforeEach(() => {
  host = new FakeHost();
  installHost(host);
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  delete (document as { fonts?: unknown }).fonts;
});

describe('embedded fonts', () => {
  it('registers the [Fonts] section under its real family and reports it', async () => {
    const font = buildTestFont({ family: 'Emb Test', win: [800, 200] });
    const par = create({ container: container(), subtitle: script('Emb Test', embed('Emb Test_0.ttf', font)) });
    await par.ready;
    expect(host.created.map((c) => c.family)).toEqual(['Emb Test']);
    expect(host.active.size).toBe(1);
    const r = par.getFontReport();
    const emb = r.fonts.find((f) => f.name === 'Emb Test')!;
    expect(emb).toMatchObject({ status: 'embedded', styles: ['Default'], lines: [0], sizeRatio: 1, ratioSource: 'font-file', syntheticBold: false });
    expect(r.fonts.find((f) => f.name === 'Other Font')).toMatchObject({ lines: [1] });
    expect(r.pending).toBe(false);
    par.destroy();
    expect(host.active.size).toBe(0);
  });

  it('does not draw text while the script fonts load, then re-layouts once', async () => {
    host.hold = true;
    const font = buildTestFont({ family: 'Gate Font', win: [1000, 250] });
    const par = create({ container: container(), subtitle: script('Gate Font', embed('Gate Font_0.ttf', font)) });
    let changes = 0;
    par.onFontsChange(() => { changes++; });
    par.renderAt(1);
    await Promise.resolve();
    expect(lines(par.element)).toHaveLength(0);
    expect(par.getFontReport().pending).toBe(true);
    host.release();
    await par.ready;
    expect(lines(par.element)).toHaveLength(2);
    expect(changes).toBeGreaterThan(0);
    const frag = par.element.querySelector<HTMLElement>('.par-frag')!;
    expect(frag.style.fontFamily).toContain('Gate Font');
    // \fs 20 with a cell of 1250 units per 1000 em => 16px
    expect(frag.style.fontSize).toBe('16px');
    expect(par.getFontReport().pending).toBe(false);
    par.destroy();
  });

  it('applies the real bold face (and flags synthetic bold when it is missing)', async () => {
    const regular = buildTestFont({ family: 'Fam Test' });
    const bold = buildTestFont({ family: 'Fam Test', weight: 700, subfamily: 'Bold' });
    const par = create({ container: container(), subtitle: script('Fam Test', embed('a_0.ttf', regular), -1) });
    await par.ready;
    expect(par.getFontReport().fonts.find((f) => f.name === 'Fam Test')).toMatchObject({ syntheticBold: true });
    await par.addFont(bold);
    par.renderAt(1);
    const f = par.getFontReport().fonts.find((x) => x.name === 'Fam Test')!;
    expect(f).toMatchObject({ status: 'user', syntheticBold: false });
    expect(lines(par.element)[0].querySelector<HTMLElement>('.par-frag')!.style.fontWeight).toBe('700');
    par.destroy();
  });

  it('drops embedded faces when the script changes, keeps them when the new script carries the same font', async () => {
    const font = buildTestFont({ family: 'Swap Test' });
    const par = create({ container: container(), subtitle: script('Swap Test', embed('s_0.ttf', font)) });
    await par.ready;
    par.setSubtitle(script('Swap Test', embed('s_0.ttf', font)));
    await par.ready;
    expect(host.created).toHaveLength(1);
    expect(host.active.size).toBe(1);
    par.setSubtitle(script('Arial'));
    await par.ready;
    expect(host.active.size).toBe(0);
    par.destroy();
  });

  it('embeddedFonts: false ignores the section', async () => {
    const par = create({ container: container(), embeddedFonts: false, subtitle: script('Off Test', embed('o_0.ttf', buildTestFont({ family: 'Off Test' }))) });
    await par.ready;
    expect(host.created).toHaveLength(0);
    par.destroy();
  });

  it('a corrupt embedded font produces a warning and does not block rendering', async () => {
    const par = create({ container: container(), subtitle: script('Broken', embed('b_0.ttf', new Uint8Array(200).fill(7))) });
    par.renderAt(1);
    await par.ready;
    expect(par.getFontReport().warnings.join(' ')).toMatch(/b_0\.ttf/);
    expect(lines(par.element)).toHaveLength(2);
    par.destroy();
  });
});

describe('user fonts', () => {
  it('addFont detects the family from the file; addFonts handles a mixed batch incl. TTC and a bad file', async () => {
    const par = create({ container: container(), subtitle: script('User A') });
    const a = buildTestFont({ family: 'User A' });
    const ttc = buildTestTtc([buildTestFont({ family: 'User B' }), buildTestFont({ family: 'User C', weight: 700 })]);
    const res = await par.addFonts([new Blob([a]), { source: ttc }, new Blob(['nope'])]);
    expect(res.map((r) => r.fonts.map((f) => f.family))).toEqual([['User A'], ['User B', 'User C'], []]);
    expect(res[2].error).toMatch(/not a TTF/);
    expect(par.listFonts().map((f) => f.family).sort()).toEqual(['User A', 'User B', 'User C']);
    expect(par.getFontReport().fonts.find((f) => f.name === 'User A')!.status).toBe('user');
    expect(par.removeFont(par.listFonts().find((f) => f.family === 'User A')!.id)).toBe(true);
    expect(par.listFonts()).toHaveLength(2);
    par.destroy();
    expect(host.active.size).toBe(0);
  });

  it('family option overrides the detected name; `fonts` option loads at construction', async () => {
    const par = create({ container: container(), subtitle: script('Alias Me'), fonts: [{ source: buildTestFont({ family: 'Real' }), family: 'Alias Me' }] });
    await par.ready;
    expect(par.getFontReport().fonts.find((f) => f.name === 'Alias Me')!.status).toBe('user');
    par.destroy();
  });

  it('two renderers share one registration; the last destroy removes it', async () => {
    const font = buildTestFont({ family: 'Shared Two' });
    const [a, b] = [create({ container: container(), subtitle: script('Shared Two') }), create({ container: container(), subtitle: script('Shared Two') })];
    await Promise.all([a.addFont(font), b.addFont(font)]);
    expect(host.created).toHaveLength(1);
    a.destroy();
    expect(host.active.size).toBe(1);
    b.destroy();
    expect(host.active.size).toBe(0);
  });

  it('fontMap keeps working (case-insensitive) next to loaded fonts', async () => {
    const par = create({ container: container(), subtitle: script('MY font'), fontMap: { 'My Font': '"Mapped", serif' } });
    par.renderAt(1);
    expect(lines(par.element)[0].querySelector<HTMLElement>('.par-frag')!.style.fontFamily).toContain('Mapped');
    expect(par.getFontReport().fonts.find((f) => f.name === 'MY font')).toMatchObject({ mapped: true });
    par.destroy();
  });
});

describe('local and system fonts', () => {
  it('useLocalFonts loads installed faces for names nothing else covers; no-op when the API is missing', async () => {
    const bytes = buildTestFont({ family: 'Installed One' });
    const fd = { family: 'Installed One', fullName: 'Installed One Regular', postscriptName: 'InstalledOne', style: 'Regular', blob: async () => new Blob([bytes]) };
    vi.stubGlobal('queryLocalFonts', async () => [fd]);
    const par = create({ container: container(), subtitle: script('Installed One'), useLocalFonts: true });
    await new Promise((r) => setTimeout(r, 10));
    await par.ready;
    expect(par.getFontReport().fonts.find((f) => f.name === 'Installed One')!.status).toBe('local');
    par.destroy();
    vi.unstubAllGlobals();
    installHost(host);
    const plain = create({ container: container(), subtitle: script('Installed One'), useLocalFonts: true });
    await plain.ready;
    await expect(plain.loadLocalFonts()).resolves.toBe(false);
    plain.destroy();
  });

  it('reports missing fonts when the canvas probe can tell', async () => {
    class Canvas {
      getContext() {
        let font = '';
        return {
          set font(v: string) { font = v; },
          get font() { return font; },
          measureText: () => {
            const first = /"([^"]+)"/.exec(font)?.[1];
            return { width: first === 'Installed Sans' ? 123 : font.includes('monospace') ? 100 : font.includes('serif') && !font.includes('sans-serif') ? 90 : 80, fontBoundingBoxAscent: 90, fontBoundingBoxDescent: 30 };
          },
        };
      }
    }
    vi.stubGlobal('OffscreenCanvas', Canvas);
    const par = create({ container: container(), subtitle: script('Installed Sans') });
    const r = par.getFontReport();
    expect(r.fonts.find((f) => f.name === 'Installed Sans')).toMatchObject({ status: 'system', verified: true, ratioSource: 'canvas' });
    expect(r.fonts.find((f) => f.name === 'Installed Sans')!.sizeRatio).toBeCloseTo(100 / 120, 10);
    expect(r.fonts.find((f) => f.name === 'Other Font')).toMatchObject({ status: 'missing' });
    expect(r.missing).toEqual(['Other Font']);
    par.destroy();
  });
});
