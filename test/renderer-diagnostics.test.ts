import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScriptHost } from '../src/core/ScriptHost';
import { parseScript } from '../src/parser/ScriptParser';
import type { SubtitleSource } from '../src/source/types';

import { create } from '../src/index';

const subtitle = [
  '[Script Info]',
  'ScriptType: v4.00+',
  'PlayResX: 640',
  'PlayResY: 360',
  '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: Default,Arial,24,&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,10,10,10,1',
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,first',
  'Dialogue: 1,0:00:01.50,0:00:02.50,Default,,0,0,0,,second',
].join('\r\n');

const box = (): HTMLElement => {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => 640 });
  Object.defineProperty(el, 'clientHeight', { value: 360 });
  document.body.appendChild(el);
  return el;
};

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('renderer diagnostics', () => {
  it('disables and clears the event logger on destruction', () => {
    const par = create({ container: box(), subtitle, renderMode: 'dom' });
    par.setEventLogger(() => undefined);
    par.setDiagnostics(true);
    par.renderAt(1.75);
    expect(par.getEventLog().markers.length).toBeGreaterThan(0);
    expect(par.getDiagnostics()).not.toBeNull();
    par.destroy();
    expect(par.getEventLog()).toMatchObject({ markers: [], dropped: 0 });
    expect(par.getDiagnostics()).toBeNull();
    expect(() => par.setEventLogger(() => undefined)).toThrow('destroyed');
    expect(() => par.destroy()).not.toThrow();
  });

  it('is inactive until explicitly enabled', () => {
    const par = create({ container: box(), subtitle });
    par.renderAt(1.75);
    expect(par.getDiagnostics()).toBeNull();
    par.destroy();
  });

  it('captures frame timing and stable DOM event attribution without raw text', () => {
    const par = create({ container: box(), subtitle, renderMode: 'dom' });
    par.setDiagnostics(true);
    par.renderAt(1.75);
    const snapshot = par.getDiagnostics(true)!;
    expect(snapshot).toMatchObject({ media: 1.75, presented: true, held: false, eventCount: 2 });
    expect(snapshot.serial).toBeGreaterThan(0);
    expect(snapshot.observedAt).toBeGreaterThan(0);
    expect(snapshot.sceneMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.renderMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.domMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.canvasMs).toBeNull();
    expect(snapshot.candidates).toEqual([
      { id: '0', index: 0, start: 1, end: 3, path: 'dom', style: 'Default' },
      { id: '1', index: 1, start: 1.5, end: 2.5, path: 'dom', style: 'Default' },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('first');
    expect(JSON.stringify(snapshot)).not.toContain('second');
    par.destroy();
  });

  it('clears the latest sample when diagnostics are disabled or the source changes', () => {
    const par = create({ container: box(), subtitle });
    par.setDiagnostics(true);
    par.renderAt(1.75);
    expect(par.getDiagnostics()).not.toBeNull();
    par.setDiagnostics(false);
    expect(par.getDiagnostics()).toBeNull();
    par.setDiagnostics(true);
    par.renderAt(1.75);
    expect(par.getDiagnostics()).not.toBeNull();
    par.setSubtitle(null);
    expect(par.getDiagnostics()).toBeNull();
    par.destroy();
  });

  it('captures relayout and source-update delays outside renderMs, including unchanged draws', () => {
    const par = create({ container: box(), subtitle, renderMode: 'dom' });
    let now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const update = ScriptHost.prototype.update;
    vi.spyOn(ScriptHost.prototype, 'update').mockImplementation(function (this: ScriptHost, ms) { now += 250; update.call(this, ms); });
    const width = vi.spyOn(par.element.parentElement!, 'clientWidth', 'get').mockImplementation(() => { now += 40; return 640; });
    try {
      par.setDiagnostics(true);
      par.refresh();
      const layout = par.getDiagnostics()!;
      expect(layout.relayoutMs).toBeGreaterThanOrEqual(40);
      expect(layout.sourceUpdateMs).toBe(250);
      expect(layout.prepareMs).toBeGreaterThanOrEqual(290);
      expect(layout.renderMs).toBe(0);
      expect(layout.sourceReady).toBe(true);
      expect(layout.sourceLoading).toBe(false);
      par.renderAt(1.75);
      expect(par.getDiagnostics()).toMatchObject({ rendererSubmitted: true, sceneRendered: true, prepareMs: 250, renderMs: 0 });
      par.renderAt(1.75);
      expect(par.getDiagnostics()).toMatchObject({ skipReason: 'unchanged', sceneRendered: false, rendererSubmitted: false, prepareMs: 250, sourceUpdateMs: 250 });
      par.renderAt(4);
      expect(par.getDiagnostics()).toMatchObject({ eventCount: 0, rendererSubmitted: false });
    } finally { width.mockRestore(); par.destroy(); }
  });

  it('reports uncovered/loading source windows and measures asynchronous arrival preparation', async () => {
    const parsed = parseScript(subtitle);
    let resolve!: (events: typeof parsed.events) => void;
    let now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const source: SubtitleSource = { kind: 'ass', script: parsed, duration: 10, eventCount: 2,
      readWindow: vi.fn(() => new Promise<typeof parsed.events>((r) => { resolve = r; })),
    };
    const par = create({ container: box(), subtitle: source, renderMode: 'dom' });
    try {
      await Promise.resolve();
      par.setDiagnostics(true);
      par.renderAt(1.75);
      expect(par.getDiagnostics()).toMatchObject({ sourceReady: false, sourceLoading: true, windowRange: null, eventCount: 0, rendererSubmitted: false });
      const extend = vi.spyOn((par as unknown as { fonts: { extendUsage: (...args: unknown[]) => void } }).fonts, 'extendUsage').mockImplementation(() => { now += 125; });
      resolve(parsed.events);
      await Promise.resolve();
      expect(par.getDiagnostics()).toMatchObject({ sourceReady: true, sourceLoading: true, windowPrepareTotalMs: 125, rendererSubmitted: true });
      expect(par.getDiagnostics()!.windowApplyTotalMs).toBeGreaterThanOrEqual(0);
      extend.mockRestore();
      par.setDiagnostics(false);
      expect(par.getSourceStats().windowPrepareTotalMs).toBeUndefined();
      expect(par.getSourceStats().windowApplyTotalMs).toBeUndefined();
    } finally { par.destroy(); }
  });

  it('increments frame serials and exposes the latest media time', () => {
    const par = create({ container: box(), subtitle });
    par.setDiagnostics(true);
    par.renderAt(1.1);
    const first = par.getDiagnostics()!;
    par.renderAt(1.2);
    const second = par.getDiagnostics()!;
    expect(second.serial).toBeGreaterThan(first.serial);
    expect(second.media).toBe(1.2);
    par.destroy();
  });
});
