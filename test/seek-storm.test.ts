import { afterEach, describe, expect, it } from 'vitest';

import { create } from '../src/index';
import { parseScript } from '../src/parser/ScriptParser';
import { inWindow, type SubtitleSource } from '../src/source';
import type { AssEvent } from '../src/types/script';

const HEAD = '[Script Info]\nPlayResX: 640\nPlayResY: 360\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
const cs = (s: number): string => `0:${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
/** Particles: \move + \t (colour, blur, scale) + \fad, many overlapping, plus plain dialogue. */
const TEXT = HEAD + Array.from({ length: 240 }, (_v, i) => {
  const s = (i * 0.37) % 60;
  const body = i % 5 === 0 ? `Line ${i}` : `{\\an5\\move(${i % 600},40,${(i * 7) % 600},300)\\blur3\\c&H${(i * 4001) % 0xffffff | 0x101010}&\\t(0,400,\\c&H00FF00&\\blur6\\fscx150)\\fad(100,150)}${String.fromCharCode(65 + (i % 26))}`;
  return `Dialogue: ${i % 3},${cs(s)},${cs(s + 0.3 + (i % 7) * 0.2)},Default,,0,0,0,,${body}\n`;
}).join('');

const rnd = (seed: number): (() => number) => { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };

/** Source with random read latency that honours abort (like the worker source does). */
const slowSource = (seed: number): SubtitleSource => {
  const parsed = parseScript(TEXT);
  const r = rnd(seed);
  return {
    kind: 'fake', script: { info: parsed.info, styles: parsed.styles, warnings: [] }, duration: 70, eventCount: parsed.events.length,
    readWindow: (t0, t1, signal) => new Promise<AssEvent[]>((ok, no) => {
      const timer = setTimeout(() => ok(parsed.events.filter((x) => inWindow(x, t0, t1))), Math.floor(r() * 12));
      signal?.addEventListener('abort', () => { clearTimeout(timer); no(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
    }),
  };
};

const box = (): HTMLElement => {
  const c = document.createElement('div');
  Object.defineProperty(c, 'clientWidth', { value: 640 });
  Object.defineProperty(c, 'clientHeight', { value: 360 });
  document.body.appendChild(c);
  return c;
};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
/** Stage markup with the per-instance SVG filter ids normalised. */
const stage = (el: HTMLElement): string => el.querySelector('.par-stage')!.innerHTML.replace(/par-[a-z]+-\d+/g, 'par-id');
afterEach(() => { document.body.innerHTML = ''; });

/** Waits until the renderer shows `want` (the direct evaluation of the same time), or gives up. */
const until = async (get: () => string, want: string): Promise<boolean> => {
  for (let i = 0; i < 200; i++) { if (get() === want) return true; await sleep(5); }
  return get() === want;
};

describe('seek storms end on exactly the frame direct evaluation gives', () => {
  for (const fps of [24, 30, 60, 24000 / 1001]) {
    it(`videoFps ${fps.toFixed(3)}: 40 random seeks, then the settled frame equals a whole-script render`, async () => {
      const par = create({ container: box(), subtitle: slowSource(7), videoFps: fps, renderMode: 'dom', windowSeconds: 8 });
      const ref = create({ container: box(), subtitle: TEXT, videoFps: fps, renderMode: 'dom' });
      const r = rnd(Math.round(fps * 100));
      let t = 0;
      for (let i = 0; i < 40; i++) { t = r() * 65; par.renderAt(t); await sleep(i % 4); }
      ref.renderAt(t);
      expect(await until(() => stage(par.element), stage(ref.element)), `t=${t}`).toBe(true);
      expect(await until(() => String(par.getSourceStats().loading), 'false')).toBe(true); // no read left running
      par.destroy();
      ref.destroy();
    });
  }

  it('seeking back and forth puts \\move, \\t and \\fad on the right phase each time (no state of the other place leaks)', async () => {
    const par = create({ container: box(), subtitle: slowSource(3), videoFps: 24, renderMode: 'dom' });
    const ref = create({ container: box(), subtitle: TEXT, videoFps: 24, renderMode: 'dom' });
    for (const t of [20.1, 20.35, 5.05, 20.1, 44.4, 5.05, 5.2, 44.4]) {
      par.renderAt(t);
      ref.renderAt(t);
      expect(await until(() => stage(par.element), stage(ref.element)), `t=${t}`).toBe(true);
    }
    par.destroy();
    ref.destroy();
  });

  it('a paused renderer shows the right frame after every seek (no clock running)', async () => {
    const par = create({ container: box(), subtitle: slowSource(11), videoFps: 30, renderMode: 'dom' });
    const ref = create({ container: box(), subtitle: TEXT, videoFps: 30, renderMode: 'dom' });
    expect(par.getMetrics().running).toBe(false);
    for (const t of [3.3, 40.7, 3.3, 12.01, 59.9]) {
      par.renderAt(t);
      ref.renderAt(t);
      expect(await until(() => stage(par.element), stage(ref.element)), `t=${t}`).toBe(true);
    }
    par.destroy();
    ref.destroy();
  });

  it('a seek while the previous read is pending never leaves lines of an older time on screen', async () => {
    const par = create({ container: box(), subtitle: slowSource(5), videoFps: 24, renderMode: 'dom' });
    const ref = create({ container: box(), subtitle: TEXT, videoFps: 24, renderMode: 'dom' });
    par.renderAt(10);
    par.renderAt(55);
    par.renderAt(10.5);
    await sleep(0);
    for (const l of par.element.querySelectorAll<HTMLElement>('.par-line')) {
      const e = parseScript(TEXT).events.find((x) => x.id === l.dataset.parId)!;
      expect(e.start <= 10.5 + 1e-6 && 10.5 < e.end + 1e-6, `${e.id} is not visible at 10.5`).toBe(true);
    }
    ref.renderAt(10.5);
    expect(await until(() => stage(par.element), stage(ref.element))).toBe(true);
    par.destroy();
    ref.destroy();
  });
});
