import { afterEach, describe, expect, it } from 'vitest';

import { create } from '../src/index';
import { parseScript } from '../src/parser/ScriptParser';
import { inWindow, type SubtitleSource } from '../src/source';
import type { AssEvent } from '../src/types/script';

const HEAD = '[Script Info]\nPlayResX: 640\nPlayResY: 360\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
const cs = (s: number): string => `0:${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
const TEXT = HEAD + Array.from({ length: 100 }, (_v, i) => `Dialogue: 0,${cs(i)},${cs(i + 1.5)},Default,,0,0,0,,L${i}\n`).join('');

interface Call { t0: number; t1: number; signal?: AbortSignal; done: () => void }

const manual = (): { source: SubtitleSource; calls: Call[] } => {
  const parsed = parseScript(TEXT);
  const calls: Call[] = [];
  const source: SubtitleSource = {
    kind: 'fake', script: { info: parsed.info, styles: parsed.styles, warnings: [] }, duration: 101.5, eventCount: 100,
    readWindow: (t0, t1, signal) => new Promise<AssEvent[]>((ok) => calls.push({ t0, t1, signal, done: () => ok(parsed.events.filter((x) => inWindow(x, t0, t1))) })),
  };
  return { source, calls };
};
const box = (): HTMLElement => {
  const c = document.createElement('div');
  Object.defineProperty(c, 'clientWidth', { value: 640 });
  Object.defineProperty(c, 'clientHeight', { value: 360 });
  document.body.appendChild(c);
  return c;
};
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const shown = (el: HTMLElement): string[] => [...el.querySelectorAll<HTMLElement>('.par-line')].map((l) => l.textContent ?? '');
afterEach(() => { document.body.innerHTML = ''; });

describe('window feed: the last seek wins', () => {
  it('seeking away and back cancels the read of the place that was left; its late answer is ignored', async () => {
    const m = manual();
    const par = create({ container: box(), subtitle: m.source, windowSeconds: 12 });
    await tick();
    par.renderAt(10.2);
    await tick();
    m.calls.find((c) => c.t0 > 10 && c.t0 < 10.2)!.done();
    await tick();
    expect(shown(par.element)).toEqual(['L9', 'L10']);
    par.renderAt(60.2);
    const far = m.calls[m.calls.length - 1];
    expect(far.t0).toBeGreaterThan(59);
    par.renderAt(10.4);
    expect(far.signal?.aborted).toBe(true);
    far.done(); // answers late: must not put the far lines on screen
    await tick();
    expect(shown(par.element)).toEqual([]);
    const live = m.calls[m.calls.length - 1];
    expect(live.signal?.aborted).toBe(false);
    expect(live.t0).toBeLessThanOrEqual(10.4);
    live.done();
    await tick();
    expect(shown(par.element)).toEqual(['L9', 'L10']);
    par.destroy();
  });

  it('a burst of seeks leaves exactly one live read, for the last place', async () => {
    const m = manual();
    const par = create({ container: box(), subtitle: m.source });
    await tick();
    for (const t of [5, 80, 20, 90, 33, 61, 12.5]) par.renderAt(t);
    const live = m.calls.filter((c) => !c.signal?.aborted);
    expect(live).toHaveLength(1);
    expect(live[0].t0).toBeLessThanOrEqual(12.5);
    expect(live[0].t1).toBeGreaterThan(12.5);
    live[0].done();
    await tick();
    expect(shown(par.element)).toEqual(['L12']);
    par.destroy();
  });
});
