import { afterEach, describe, expect, it, vi } from 'vitest';

import { create, type MissingFontsHandler, type PreflightReport } from '../src/index';
import { buildTestFont } from '../src/fonts/testFont';

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

const TEXT = ass([style('Good', 'Installed Sans'), style('Bad', 'Nope Sans')], [dialogue('Good', 'fine'), dialogue('Bad', 'broken'), dialogue('Good', 'also {\\fnNope Sans}mixed')]);
const shown = (el: HTMLElement): string[] => Array.from(el.querySelectorAll('.par-line')).map((l) => l.textContent ?? '');
const make = (onMissingFonts?: MissingFontsHandler | null, subtitle = TEXT) => {
  installCanvas(['Installed Sans']);
  const par = create({ container: box(), subtitle, onMissingFonts });
  par.renderAt(1);
  return par;
};

describe('missing fonts: events and the default (continue)', () => {
  it('announces the report, draws everything with the fallback font and says ok:false', async () => {
    installCanvas(['Installed Sans']);
    const par = create({ container: box() });
    const seen: PreflightReport[] = [];
    par.on('missingfonts', (r) => seen.push(r));
    par.setSubtitle(TEXT);
    par.renderAt(1);
    await par.ready;
    par.renderAt(1);
    expect(seen).toHaveLength(1);
    expect(seen[0].ok).toBe(false);
    expect(seen[0].missing.map((m) => m.name)).toEqual(['Nope Sans']);
    expect(par.missingFonts).toBe(seen[0]);
    expect(shown(par.element)).toHaveLength(3);
    par.destroy();
  });

  it('no event for a script without missing fonts', async () => {
    const par = make(null, ass([style('Default', 'Installed Sans')], [dialogue('Default', 'x')]));
    const fn = vi.fn();
    par.on('missingfonts', fn);
    await par.ready;
    expect(fn).not.toHaveBeenCalled();
    expect(par.missingFonts).toBeNull();
    par.destroy();
  });
});

describe("'wait'", () => {
  it('holds only the events that use a missing family, until continue() is called', async () => {
    let ctrl: { continue(): void } | null = null;
    const handler = vi.fn<MissingFontsHandler>((_r, c) => { ctrl = c; return 'wait'; });
    const par = make(handler);
    await par.ready;
    par.renderAt(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(shown(par.element)).toEqual(['fine']); // 'broken' and 'also mixed' use the missing family in some fragment
    ctrl!.continue();
    par.renderAt(1);
    expect(shown(par.element)).toHaveLength(3);
    par.destroy();
  });

  it('continueWithMissing() does the same; adding the font releases the hold by itself and announces ok', async () => {
    const par = make(() => 'wait');
    const reports: PreflightReport[] = [];
    par.on('missingfonts', (r) => reports.push(r));
    await par.ready;
    par.renderAt(1);
    expect(shown(par.element)).toHaveLength(1);
    await par.addFont(buildTestFont({ family: 'Nope Sans' }));
    await par.ready;
    par.renderAt(1);
    expect(shown(par.element)).toHaveLength(3);
    expect(reports[reports.length - 1].ok).toBe(true);
    par.destroy();

    const other = make(() => 'wait');
    await other.ready;
    other.continueWithMissing();
    other.renderAt(1);
    expect(shown(other.element)).toHaveLength(3);
    other.destroy();
  });

  it('a pending promise holds; resolving with continue (or rejecting) draws; resolving with wait keeps holding', async () => {
    let resolve!: (v: 'continue' | 'wait') => void;
    const par = make(() => new Promise((r) => { resolve = r; }));
    await par.ready; // ready never waits for the person
    par.renderAt(1);
    expect(shown(par.element)).toHaveLength(1);
    resolve('continue');
    await Promise.resolve();
    await Promise.resolve();
    par.renderAt(1);
    expect(shown(par.element)).toHaveLength(3);
    par.destroy();

    const rejected = make(() => Promise.reject(new Error('no')));
    await rejected.ready;
    await Promise.resolve();
    await Promise.resolve();
    rejected.renderAt(1);
    expect(shown(rejected.element)).toHaveLength(3);
    rejected.destroy();

    const still = make(() => Promise.resolve('wait' as const));
    await still.ready;
    await Promise.resolve();
    still.renderAt(1);
    expect(shown(still.element)).toHaveLength(1);
    still.destroy();
  });

  it('a throwing handler means continue', async () => {
    const par = make(() => { throw new Error('oops'); });
    await par.ready;
    par.renderAt(1);
    expect(shown(par.element)).toHaveLength(3);
    par.destroy();
  });

  it('is asked once per script: a new script starts over, setOptions({ onMissingFonts: null }) clears the handler', async () => {
    const handler = vi.fn<MissingFontsHandler>(() => 'wait');
    const par = make(handler);
    await par.ready;
    par.setSubtitle(TEXT.split('Nope Sans').join('Other Nope'));
    await par.ready;
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[1][0].missing.map((m) => m.name)).toEqual(['Other Nope']);
    par.setOptions({ onMissingFonts: null });
    par.setSubtitle(TEXT);
    await par.ready;
    par.renderAt(1);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(shown(par.element)).toHaveLength(3);
    par.destroy();
  });
});

describe('instance preflight', () => {
  it('preflight() with no argument reports the current script after the font work finished', async () => {
    const par = make();
    const r = await par.preflight();
    expect(r.ok).toBe(false);
    expect(r.missing.map((m) => m.name)).toEqual(['Nope Sans']);
    expect(r.resolved.map((m) => m.name)).toEqual(['Installed Sans']);
    par.destroy();
  });

  it('preflight(text) of another script asks providers and keeps their fonts loaded for later', async () => {
    installCanvas([]);
    const get = vi.fn(async () => buildTestFont({ family: 'Next Font' }));
    const par = create({ container: box(), fontProviders: [{ name: 'p', get }] });
    const r = await par.preflight(ass([style('Default', 'Next Font')], [dialogue('Default', 'x')]));
    expect(r.ok).toBe(true);
    expect(r.providerHits).toEqual({ p: ['Next Font'] });
    expect(par.listFonts().map((f) => f.source)).toEqual(['provider']);
    par.setSubtitle(ass([style('Default', 'Next Font')], [dialogue('Default', 'x')]));
    await par.ready;
    expect(get).toHaveBeenCalledTimes(1); // already loaded: not asked again
    par.destroy();
  });
});
