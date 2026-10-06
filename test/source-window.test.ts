import { afterEach, describe, expect, it } from 'vitest';

import { create } from '../src/index';
import { parseScript } from '../src/parser/ScriptParser';
import { fromAssText, inWindow, type SubtitleSource } from '../src/source';
import type { AssEvent } from '../src/types/script';

const HEAD = '[Script Info]\nPlayResX: 640\nPlayResY: 360\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
const cs = (s: number): string => `0:${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
const TEXT = HEAD + Array.from({ length: 100 }, (_v, i) => `Dialogue: 0,${cs(i)},${cs(i + 1.5)},Default,,0,0,0,,L${i}\n`).join('');

interface Call { t0: number; t1: number; signal?: AbortSignal; done: (e?: AssEvent[]) => void }

/** Source whose reads stay pending until the test resolves them. */
const manual = (): { source: SubtitleSource; calls: Call[]; closed: () => boolean } => {
  const parsed = parseScript(TEXT);
  const calls: Call[] = [];
  let closed = false;
  const source: SubtitleSource = {
    kind: 'fake', script: { info: parsed.info, styles: parsed.styles, warnings: [] }, duration: 101.5, eventCount: 100,
    readWindow: (t0, t1, signal) => new Promise((ok) => calls.push({ t0, t1, signal, done: (e) => ok(e ?? parsed.events.filter((x) => inWindow(x, t0, t1))) })),
    stats: () => ({ bytesRead: 123, decodeMs: 4 }),
    close: () => { closed = true; },
  };
  return { source, calls, closed: () => closed };
};

const box = () => {
  const c = document.createElement('div');
  Object.defineProperty(c, 'clientWidth', { value: 640 });
  Object.defineProperty(c, 'clientHeight', { value: 360 });
  document.body.appendChild(c);
  return c;
};
const shown = (el: HTMLElement): string[] => [...el.querySelectorAll<HTMLElement>('.par-line')].map((l) => l.textContent ?? '');
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
/** Resolves every pending read (and the reads that follow) until the feed has nothing left to ask for. */
const settle = async (calls: Call[]): Promise<void> => { for (let i = 0; i < 50; i++) { await tick(); const c = calls.find((x) => !x.signal?.aborted && !(x as Call & { d?: boolean }).d); if (!c) return; (c as Call & { d?: boolean }).d = true; c.done(); } };
afterEach(() => { document.body.innerHTML = ''; });

describe('renderer with a windowed source', () => {
  it('draws nothing until the window for the time has loaded, then the right lines', async () => {
    const m = manual();
    const par = create({ container: box(), subtitle: m.source, windowSeconds: 6 });
    par.renderAt(10.2);
    await tick();
    expect(shown(par.element)).toEqual([]);
    expect(par.getSourceStats()).toMatchObject({ loading: true, windowEvents: 0, windowRange: null, bytesRead: 123 });
    expect(m.calls).toHaveLength(1);
    expect([m.calls[0].t0, m.calls[0].t1]).toEqual([10.1, 10.6]);
    m.calls[0].done();
    await tick();
    expect(shown(par.element)).toEqual(['L9', 'L10']);
    expect(par.getSourceStats()).toMatchObject({ loading: true, windowRange: [10.1, 10.6] }); // the quick window is short: the next slice is already on its way
    expect([m.calls[1].t0, m.calls[1].t1]).toEqual([10.6, 11.85]);
    par.destroy();
    expect(m.closed()).toBe(true);
  });

  it('a seek cancels the stale read and never shows lines of the old place', async () => {
    const m = manual();
    const par = create({ container: box(), subtitle: m.source });
    par.renderAt(10.2);
    await tick();
    par.renderAt(50.2);
    expect(m.calls[0].signal?.aborted).toBe(true);
    expect(m.calls).toHaveLength(2);
    m.calls[0].done();
    await tick();
    expect(shown(par.element)).toEqual([]);
    m.calls[1].done();
    await tick();
    expect(shown(par.element)).toEqual(['L49', 'L50']);
    par.renderAt(10.2);
    expect(shown(par.element)).toEqual([]);
    par.destroy();
  });

  it('scrubbing inside a pending window does not restart the read', async () => {
    const m = manual();
    const par = create({ container: box(), subtitle: m.source });
    par.renderAt(10);
    await tick();
    par.renderAt(10.2);
    par.renderAt(10.35);
    expect(m.calls).toHaveLength(1);
    par.destroy();
  });

  it('grows the window in slices ahead of the playhead and evicts what fell behind', async () => {
    const m = manual();
    const par = create({ container: box(), subtitle: m.source, windowSeconds: 12 });
    par.renderAt(20);
    await tick();
    expect([m.calls[0].t0, m.calls[0].t1]).toEqual([19.9, 20.4]);
    await settle(m.calls);
    expect(m.calls.slice(1).map((c) => [c.t0, c.t1])).toEqual([[20.4, 22.9], [22.9, 25.4]]);
    expect(par.getSourceStats()).toMatchObject({ windowRange: [19.9, 25.4], loading: false });
    par.renderAt(21);
    await settle(m.calls);
    expect(m.calls).toHaveLength(4);
    expect([m.calls[3].t0, m.calls[3].t1]).toEqual([25.4, 27.9]);
    const full = par.getSourceStats().windowEvents;
    expect(full).toBeGreaterThan(5);
    for (const t of [24, 27, 30, 33, 36]) { par.renderAt(t); await settle(m.calls); }
    const st = par.getSourceStats();
    expect(st.windowRange![0]).toBeGreaterThanOrEqual(36 - 2.0001);
    expect(par.script!.events.every((e) => e.end > 33.9)).toBe(true);
    expect(st.windowEvents).toBeLessThan(12);
    par.destroy();
  });

  it('plays a text source exactly like a text subtitle', async () => {
    const a = create({ container: box(), subtitle: TEXT });
    const b = create({ container: box(), subtitle: fromAssText(TEXT) });
    await tick();
    for (const t of [0.4, 1.2, 1.6, 7.9, 33.3]) {
      a.renderAt(t);
      b.renderAt(t);
      await tick();
      expect(shown(b.element), `t=${t}`).toEqual(shown(a.element));
    }
    a.destroy();
    b.destroy();
  });

  it('string subtitles keep working and report their event count', () => {
    const par = create({ container: box(), subtitle: TEXT });
    expect(par.getSourceStats()).toMatchObject({ windowEvents: 100, windowRange: null, loading: false });
    par.setSubtitle(null);
    expect(par.script).toBeNull();
    par.destroy();
  });

  it('events of a window feed the font set (styles first, overrides when they arrive)', async () => {
    const text = TEXT.replace('L10', '{\\fnZetaFont}L10');
    const m = manual();
    m.source.script.styles = parseScript(text).styles;
    const par = create({ container: box(), subtitle: m.source });
    par.renderAt(10.2);
    await tick();
    const names = (): string[] => par.getFontReport().fonts.map((u) => u.name);
    expect(names()).toContain('Arial');
    expect(names()).not.toContain('ZetaFont');
    m.calls[0].done(parseScript(text).events.filter((e) => inWindow(e, 9.7, 12.2)));
    await tick();
    await par.ready;
    expect(names()).toContain('ZetaFont');
    par.destroy();
  });
});

describe('windowed source: stepping backwards and failures', () => {
  it('stepping back to the window edge loads the part before it', async () => {
    const m = manual();
    const par = create({ container: box(), subtitle: m.source });
    par.renderAt(20);
    await tick();
    await settle(m.calls);
    const lo = par.getSourceStats().windowRange![0];
    par.renderAt(lo + 0.2);
    par.renderAt(lo + 0.1);
    await settle(m.calls);
    expect(par.getSourceStats().windowRange![0]).toBeLessThan(lo - 1);
    par.destroy();
  });

  it('a failing read reports once per second at most and never throws into the render loop', async () => {
    const m = manual();
    let n = 0;
    m.source.readWindow = () => { n++; return Promise.reject(new Error('disk gone')); };
    const warn = console.warn;
    console.warn = () => undefined;
    const par = create({ container: box(), subtitle: m.source });
    par.renderAt(5);
    await tick();
    for (let i = 0; i < 20; i++) { par.renderAt(5); await tick(); }
    console.warn = warn;
    expect(n).toBe(1);
    expect(shown(par.element)).toEqual([]);
    par.destroy();
  });
});
