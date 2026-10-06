import { afterEach, describe, expect, it, vi } from 'vitest';

import { create, createUrlProvider, type FontProvider } from '../src/index';
import { buildTestFont } from '../src/fonts/testFont';
import { uuencode } from '../src/fonts/uudecode';

import { ass, dialogue, style } from './helpers/ass';
import { installCanvas } from './helpers/fakeCanvas';

const boxes: HTMLElement[] = [];
const box = (): HTMLElement => {
  const c = document.createElement('div');
  Object.defineProperty(c, 'clientWidth', { value: 640 });
  Object.defineProperty(c, 'clientHeight', { value: 360 });
  document.body.appendChild(c);
  boxes.push(c);
  return c;
};
afterEach(() => { boxes.forEach((b) => b.remove()); boxes.length = 0; vi.unstubAllGlobals(); });

const font = (family: string, weight = 400, italic = false) => buildTestFont({ family, weight, italic });
const script = (fontName: string, text = 'x', bold = 0) => ass([style('Default', fontName, bold)], [dialogue('Default', text)]);

const provider = (name: string, files: Record<string, Uint8Array | (() => Promise<Uint8Array | null>)>, log: string[] = []): FontProvider => ({
  name,
  async get(family, req) {
    log.push(`${name}:${family}:${req.weight}:${req.italic}`);
    const f = files[family.toLowerCase()];
    return typeof f === 'function' ? f() : f ?? null;
  },
});

const statusOf = (par: ReturnType<typeof create>, name: string) => par.getFontReport().fonts.find((f) => f.name === name)!.status;

describe('provider resolution order', () => {
  it('provider beats the system font, loses to a user font, an embedded font and fontMap', async () => {
    installCanvas(['Sys Font']);
    const log: string[] = [];
    const p = provider('lib', { 'sys font': font('Sys Font'), 'user font': font('User Font'), 'emb font': font('Emb Font'), 'mapped font': font('Mapped Font') }, log);
    const emb = ['[Fonts]', 'fontname: Emb Font_0.ttf', ...uuencode(font('Emb Font')), ''].join('\n');
    const text = ass([style('A', 'Sys Font'), style('B', 'User Font'), style('C', 'Emb Font'), style('D', 'Mapped Font'), style('E', 'Nowhere')],
      ['A', 'B', 'C', 'D', 'E'].map((s) => dialogue(s, 'x')), emb);
    const par = create({ container: box(), subtitle: text, fontProviders: [p], fontMap: { 'Mapped Font': 'Serif Thing, serif' }, fonts: [font('User Font')] });
    await par.ready;
    expect(statusOf(par, 'Sys Font')).toBe('provider');
    expect(statusOf(par, 'User Font')).toBe('user');
    expect(statusOf(par, 'Emb Font')).toBe('embedded');
    expect(statusOf(par, 'Mapped Font')).toBe('system');
    expect(statusOf(par, 'Nowhere')).toBe('missing');
    expect(log.map((l) => l.split(':')[1]).sort()).toEqual(['Nowhere', 'Sys Font']);
    par.destroy();
  });

  it('providers are asked in array order; the first answer wins and later ones are not called', async () => {
    const log: string[] = [];
    const a = provider('a', {}, log);
    const b = provider('b', { 'fam': font('Fam') }, log);
    const c = provider('c', { 'fam': font('Fam') }, log);
    const par = create({ container: box(), subtitle: script('Fam'), fontProviders: [a, b, c] });
    await par.ready;
    expect(log).toEqual(['a:Fam:400:false', 'b:Fam:400:false']);
    expect((await par.preflight()).providerHits).toEqual({ b: ['Fam'] });
    par.destroy();
  });

  it('asks again for a real bold face when only a synthetic one is available, and a skip via has()', async () => {
    const log: string[] = [];
    const p: FontProvider = {
      name: 'v', has: async (f) => f.toLowerCase() === 'fam',
      async get(_family, req) { log.push(`${req.weight}`); return req.weight >= 700 ? font('Fam', 700) : font('Fam', 400); },
    };
    const par = create({ container: box(), subtitle: ass([style('Default', 'Fam')], [dialogue('Default', 'a{\\b1}b')]), fontProviders: [p] });
    await par.ready;
    expect(log.sort()).toEqual(['400', '700']);
    expect(par.listFonts().map((f) => f.weight).sort()).toEqual([400, 700]);
    expect((await par.preflight()).synthetic).toEqual([]);
    const none = create({ container: box(), subtitle: script('Other'), fontProviders: [p] });
    await none.ready;
    expect(log).toHaveLength(2); // has() said no: get() was not called
    par.destroy();
    none.destroy();
  });

  it('a throwing provider is a warning and the next provider still answers; a silent one times out', async () => {
    const bad: FontProvider = { name: 'bad', get: async () => { throw new Error('boom'); } };
    const slow: FontProvider = { name: 'slow', get: () => new Promise(() => {}) };
    const good = provider('good', { fam: font('Fam') });
    const par = create({ container: box(), subtitle: script('Fam'), fontProviders: [bad, slow, good], providerTimeout: 30 });
    await par.ready;
    expect(statusOf(par, 'Fam')).toBe('provider');
    const warnings = par.getFontReport().warnings.join('\n');
    expect(warnings).toMatch(/"bad".*boom/);
    expect(warnings).toMatch(/"slow".*no answer within 30 ms/);
    par.destroy();
  });

  it('a provider that returns garbage does not break the script', async () => {
    const par = create({ container: box(), subtitle: script('Fam'), fontProviders: [provider('junk', { fam: new Uint8Array([1, 2, 3, 4, 5, 6]) })] });
    await par.ready;
    expect(par.getFontReport().warnings.join()).toMatch(/junk/);
    par.destroy();
  });

  it('the requested family becomes an alias when the file carries another name', async () => {
    const par = create({ container: box(), subtitle: script('Friendly Name'), fontProviders: [provider('p', { 'friendly name': font('Real Internal Name') })] });
    await par.ready;
    expect(statusOf(par, 'Friendly Name')).toBe('provider');
    par.destroy();
  });

  it('subscribe(): a provider that gains the font later makes PAR ask again; refreshProviders() does the same by hand', async () => {
    const files: Record<string, Uint8Array> = {};
    let notify = () => {};
    const p: FontProvider = { name: 'live', get: async (f) => files[f.toLowerCase()] ?? null, subscribe: (fn) => { notify = fn; return () => { notify = () => {}; }; } };
    installCanvas([]);
    const par = create({ container: box(), subtitle: script('Late Font'), fontProviders: [p] });
    await par.ready;
    expect(statusOf(par, 'Late Font')).toBe('missing');
    files['late font'] = font('Late Font');
    notify();
    await par.ready;
    expect(statusOf(par, 'Late Font')).toBe('provider');
    const q = create({ container: box(), subtitle: script('Other Late'), fontProviders: [{ name: 'plain', get: async (f) => files[f.toLowerCase()] ?? null }] });
    await q.ready;
    files['other late'] = font('Other Late');
    q.refreshProviders();
    await q.ready;
    expect(statusOf(q, 'Other Late')).toBe('provider');
    par.destroy();
    q.destroy();
  });

  it('removing a user font lets a provider cover the name; changing providers drops the old provider faces', async () => {
    const par = create({ container: box(), subtitle: script('Fam'), fontProviders: [provider('p', { fam: font('Fam') })], fonts: [font('Fam', 400)] });
    await par.ready;
    expect(statusOf(par, 'Fam')).toBe('user');
    par.removeFont(par.listFonts()[0].id);
    await par.ready;
    expect(statusOf(par, 'Fam')).toBe('provider');
    par.setOptions({ fontProviders: [] });
    await par.ready;
    expect(par.listFonts()).toHaveLength(0);
    par.destroy();
  });
});

describe('createUrlProvider', () => {
  it('serves a URL map (case-insensitive, @ stripped), picks the closest weight and downloads each URL once', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { calls.push(u); return new Response(font('Net Font')); }));
    const p = createUrlProvider('cdn', { 'Net Font': [{ url: 'https://x/reg.ttf' }, { url: 'https://x/bold.ttf', weight: 700 }], Solo: 'https://x/solo.ttf' });
    expect(await p.has!('@net font')).toBe(true);
    expect(await p.has!('nothing')).toBe(false);
    expect(await p.get('nothing', { weight: 400, italic: false })).toBeNull();
    await p.get('NET FONT', { weight: 700, italic: false });
    await p.get('Net Font', { weight: 700, italic: false });
    await p.get('Net Font', { weight: 400, italic: false });
    expect(calls).toEqual(['https://x/bold.ttf', 'https://x/reg.ttf']);
  });

  it('reads a manifest once, with aliases, and works end to end in a renderer', async () => {
    const manifest = { fonts: [{ family: 'Manifest Font', aliases: ['MF Alias'], url: 'https://x/m.ttf' }, { nonsense: true }] };
    const fetchMock = vi.fn(async (u: string) => (u.endsWith('.json') ? new Response(JSON.stringify(manifest)) : new Response(font('Manifest Font'))));
    vi.stubGlobal('fetch', fetchMock);
    const par = create({ container: box(), subtitle: script('MF Alias'), fontProviders: [createUrlProvider('m', { manifest: 'https://x/fonts.json' })] });
    await par.ready;
    expect(statusOf(par, 'MF Alias')).toBe('provider');
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('.json'))).toHaveLength(1);
    par.destroy();
  });

  it('a manifest that fails to load is a warning, not an exception', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    const par = create({ container: box(), subtitle: script('Fam'), fontProviders: [createUrlProvider('m', { manifest: 'https://x/fonts.json' })] });
    await par.ready;
    expect(par.getFontReport().warnings.join()).toMatch(/HTTP 500/);
    par.destroy();
  });
});
