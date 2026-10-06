import { describe, expect, it } from 'vitest';

import type { PreparedLine } from '../src/anim/Prepared';
import { snapToFrame } from '../src/core/options';
import { create } from '../src/index';
import { frameIndex, frameMs, frameRate, msOf, timeToMs } from '../src/core/time';
import { Timeline } from '../src/core/Timeline';
import { inWindow } from '../src/source/window';
import type { AssEvent } from '../src/types/script';

import { rng } from './helpers/gen';

const FPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60, 75, 120, 200];
const line = (index: number, start: number, end: number, layer = 0): PreparedLine => ({ event: { index, id: String(index), start, end, layer } as AssEvent }) as PreparedLine;
const tOf = (n: number, fps: number): number => { const r = frameRate(fps); return (n * r.den) / r.num; };
const ids = (tl: Timeline, t: number, fps: number | null): number[] => tl.visibleAt(timeToMs(t, fps)).map((l) => l.event.index);

describe('time rule: integer ms, half-open [start, end)', () => {
  it('centisecond event times become exact integers (float traps)', () => {
    expect(msOf(0.1 + 0.2)).toBe(300);
    expect(msOf(1.005)).toBe(1005);
    expect(msOf(1.15)).toBe(1150);
    expect(msOf(4.35)).toBe(4350);
    expect(msOf(8.2 - 0.1)).toBe(8100);
    expect(msOf(-0)).toBe(0);
    expect(Object.is(msOf(-0.0001), 0)).toBe(true);
  });

  it('frame index is drift-free for every common rate (NTSC as exact fractions)', () => {
    for (const fps of FPS) {
      const r = frameRate(fps);
      for (const n of [0, 1, 2, 23, 24, 25, 1000, 86399, 86400, 1_000_000]) expect(frameIndex(tOf(n, fps), r)).toBe(n);
    }
    expect(frameRate(23.976)).toEqual({ num: 24000, den: 1001 });
    expect(frameRate(29.97)).toEqual({ num: 30000, den: 1001 });
    expect(frameRate(59.94)).toEqual({ num: 60000, den: 1001 });
    expect(frameRate(24)).toEqual({ num: 24, den: 1 });
    expect(frameRate(12.5)).toEqual({ num: 12500, den: 1000 });
  });

  it('frame times in ms (one rounding of n * 1000 * den / num)', () => {
    expect(frameMs(24, frameRate(24))).toBe(1000);
    expect(frameMs(25, frameRate(24))).toBe(1042);
    expect(frameMs(24, frameRate(23.976))).toBe(1001);
    expect(frameMs(24000, frameRate(23.976))).toBe(1_001_000);
    expect(frameMs(30, frameRate(29.97))).toBe(1001);
    expect(snapToFrame(1.03, 10)).toBeCloseTo(1.0);
    expect(snapToFrame(0.1 * 3, 10)).toBeCloseTo(0.3);
    expect(timeToMs(1.0, null)).toBe(1000);
    expect(timeToMs(0.1 + 0.2, null)).toBe(300);
    expect(timeToMs(1.0004999, null)).toBe(1000);
    expect(timeToMs(1.0005, null)).toBe(1001);
  });

  it('which frame shows a line when its start / end falls mid-frame (24 fps, table)', () => {
    const tl = new Timeline([line(0, 1.02, 1.5)]);
    const seen = (n: number): boolean => ids(tl, tOf(n, 24), 24).length === 1;
    expect([24, 25, 35, 36].map(seen)).toEqual([false, true, true, false]);
    // start 1.00 exactly on frame 24: visible on it. End 1.50 = frame 36: gone on it.
    const t2 = new Timeline([line(0, 1.0, 1.5)]);
    expect([23, 24, 35, 36].map((n) => ids(t2, tOf(n, 24), 24).length)).toEqual([0, 1, 1, 0]);
    // 23.976: frame 24 is at 1.001 s => a line starting at 1.00 is visible there, one starting at 1.01 is not
    const t3 = new Timeline([line(0, 1.0, 2), line(1, 1.01, 2)]);
    expect(ids(t3, tOf(24, 23.976), 23.976)).toEqual([0]);
    expect(ids(t3, tOf(25, 23.976), 23.976)).toEqual([0, 1]);
  });

  it('without a frame rate the same boundary rule holds', () => {
    const tl = new Timeline([line(0, 1.0, 2.0), line(1, 2.0, 3.0)]);
    expect(ids(tl, 0.999, null)).toEqual([]);
    expect(ids(tl, 1.0, null)).toEqual([0]);
    expect(ids(tl, 1.999, null)).toEqual([0]);
    expect(ids(tl, 2.0, null)).toEqual([1]);
    expect(ids(tl, 3.0, null)).toEqual([]);
  });

  it('zero or negative duration is never visible', () => {
    const tl = new Timeline([line(0, 1.0, 1.0), line(1, 2.0, 1.5)]);
    for (let ms = 0; ms < 3000; ms++) expect(tl.visibleAt(ms)).toEqual([]);
  });

  it('a contiguous chain shows EXACTLY one line on every frame (no overlap, no gap frame)', () => {
    const r = rng(7);
    for (let round = 0; round < 6; round++) {
      let cs = 0;
      const lines: PreparedLine[] = [];
      for (let i = 0; i < 40; i++) { const next = cs + 1 + Math.floor(r() * 120); lines.push(line(i, cs / 100, next / 100)); cs = next; }
      const tl = new Timeline(lines);
      for (const l of lines) for (const ms of [msOf(l.event.end) - 1, msOf(l.event.end)]) if (ms < cs * 10) expect(tl.visibleAt(ms)).toHaveLength(1);
      for (const fps of [...FPS, null]) {
        const r2 = fps ? frameRate(fps) : null;
        const last = Math.ceil((cs / 100) * (fps ?? 1000) + 2);
        for (let n = 0; n <= last; n += fps ? 1 : 13) {
          const t = r2 ? tOf(n, fps!) : n / 1000;
          const ms = timeToMs(t, fps);
          const vis = ids(tl, t, fps);
          if (ms < cs * 10) expect(vis, `fps ${fps} frame ${n} ms ${ms}`).toHaveLength(1);
          else expect(vis).toHaveLength(0);
        }
      }
    }
  });

  it('end == next start on the same layer is never drawn twice or not at all (renderer, 24/30/60 fps)', () => {
    const ass = '[Script Info]\nPlayResX: 640\nPlayResY: 360\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' +
      'Dialogue: 0,0:00:00.50,0:00:01.00,Default,,0,0,0,,A\nDialogue: 0,0:00:01.00,0:00:01.50,Default,,0,0,0,,B\n';
    for (const fps of [24, 30, 60, 23.976]) {
      const c = document.createElement('div');
      Object.defineProperty(c, 'clientWidth', { value: 640 });
      Object.defineProperty(c, 'clientHeight', { value: 360 });
      document.body.appendChild(c);
      const par = create({ container: c, subtitle: ass, videoFps: fps });
      for (let n = Math.floor(0.4 * fps); n < 1.6 * fps; n++) {
        par.renderAt(tOf(n, fps));
        const shown = [...par.element.querySelectorAll<HTMLElement>('.par-line')].map((e) => e.dataset.parId);
        const ms = timeToMs(tOf(n, fps), fps);
        expect(shown, `fps ${fps} frame ${n}`).toEqual(ms < 500 ? [] : ms < 1000 ? ['0'] : ms < 1500 ? ['1'] : []);
      }
      par.destroy();
      c.remove();
    }
  });
});

describe('windowed sources use the same rule on window borders', () => {
  const ev = (index: number, start: number, end: number): AssEvent => ({ index, id: String(index), start, end }) as AssEvent;
  it('adjacent windows never double count or miss a border event', () => {
    const a = ev(0, 0.5, 1.0);
    const b = ev(1, 1.0, 1.5);
    const c = ev(2, 0.5, 1.5);
    const z = ev(3, 1.0, 1.0);
    const first = [a, b, c, z].filter((e) => inWindow(e, 0, 1)).map((e) => e.index);
    const second = [a, b, c, z].filter((e) => inWindow(e, 1, 2)).map((e) => e.index);
    expect(first).toEqual([0, 2]);
    expect(second).toEqual([1, 2]);
  });
  it('float noise on the window border does not move an event across it', () => {
    expect(inWindow(ev(0, 1.0, 1.5), 0, 0.1 * 10)).toBe(false);
    expect(inWindow(ev(0, 0.5, 1.0), 0.1 * 10, 2)).toBe(false);
  });
});
