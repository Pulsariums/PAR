import { describe, expect, it, vi } from 'vitest';

import { prepareLine } from '../src/anim/Prepared';
import { analyzeLine } from '../src/canvas/eligibility';
import { specAt } from '../src/canvas/plan';
import { SpriteCache } from '../src/canvas/SpriteCache';
import { spriteRequests } from '../src/canvas/sprites';
import { Ahead } from '../src/canvas/warm/ahead';
import { Frontier } from '../src/canvas/warm/frontier';
import { Throughput } from '../src/canvas/warm/rate';
import { Stall } from '../src/core/Stall';
import { frameMs as frameStart, frameRate } from '../src/core/time';
import { parseScript } from '../src/parser/ScriptParser';
import type { LineEnv } from '../src/render/LineView';

const HEAD = '[Script Info]\nPlayResX: 640\nPlayResY: 360\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
const fonts = { resolve: () => ({ family: 'Arial', weight: 400, italic: false, ratio: 1 }) };

describe('sampling is exact: every frame of an event finds its sprite planned', () => {
  const cases = ['\\blur2\\t(0,900,\\blur6\\c&H0000FF&)', '\\blur2\\move(1,1,50,50)\\frz30\\fad(100,100)\\t(\\frz90)', '\\fs30\\t(0,1200,\\fs60\\fscx150)', '\\bord3\\t(200,700,\\bord9\\3c&HFF0000&)'];
  for (const fps of [24, 23.976, 25, 30]) {
    it(`at ${fps} fps, start not on a frame`, () => {
      for (const tags of cases) {
        const start = 1013;
        const sc = parseScript(`${HEAD}Dialogue: 0,0:00:01.01,0:00:02.60,Default,,0,0,0,,{\\an5\\pos(10,10)${tags}}K\n`);
        const line = prepareLine(sc.events[0], sc.styles, sc.info);
        const env = { layout: { width: 640, height: 360 }, styles: sc.styles, borderScale: 1, blurScale: 1, devScale: 1, frameMs: 1000 / fps, fonts } as unknown as LineEnv;
        const animated = analyzeLine(line).animated;
        const planned = new Set(spriteRequests(line, env, animated, 1000 / fps, line.event.start * 1000 | 0 ? Math.round(line.event.start * 1000) : start).map((r) => r.key));
        const s0 = Math.round(line.event.start * 1000), e0 = Math.round(line.event.end * 1000);
        const rate = frameRate(fps);
        let n = 0, checked = 0;
        for (let k = 0; frameStart(k, rate) < e0; k++) {
          const t = frameStart(k, rate);
          if (t < s0) continue;
          n++;
          expect(planned.has(specAt(line, t - s0, env, animated, { blur: 0 }).key)).toBe(true);
          checked++;
        }
        expect(checked).toBe(n);
        expect(n).toBeGreaterThan(10);
      }
    });
  }
  it('an event with nothing key-animated is one sprite however long it lives', () => {
    const sc = parseScript(`${HEAD}Dialogue: 0,0:00:01.00,0:00:09.00,Default,,0,0,0,,{\\an5\\move(1,1,50,50)\\frz30\\t(\\frz90)\\fad(100,100)\\blur2}K\n`);
    const line = prepareLine(sc.events[0], sc.styles, sc.info);
    const env = { layout: { width: 640, height: 360 }, styles: sc.styles, borderScale: 1, blurScale: 1, devScale: 1, frameMs: 1000 / 24, fonts } as unknown as LineEnv;
    const r = spriteRequests(line, env, analyzeLine(line).animated, 1000 / 24, 1000);
    expect(r).toHaveLength(1);
    expect(r[0].until).toBe(9000);
  });
});

describe('Frontier: what is pending and how long the playhead would have to wait', () => {
  it('first, done, and a deficit that follows the builders', () => {
    const f = new Frontier();
    f.add('a', 1000, 10); f.add('b', 1200, 10); f.add('c', 5000, 10);
    expect(f.first).toBe(1000);
    f.done('a');
    expect(f.first).toBe(1200);
    // 20 ms of work before 5000: plenty of room for a fast builder, none for a slow one at t = 1100
    expect(f.deficit(1100, 1, 40)).toBe(0);
    expect(f.deficit(1100, 0.05, 40)).toBeGreaterThan(0); // b alone needs 200 ms, due in 60
    expect(f.deficit(1100, 0.05, 40)).toBeCloseTo(10 / 0.05 - (1200 - 1100 - 40), -1);
    f.done('b'); f.done('c');
    expect(f.first).toBe(Infinity);
    expect(f.deficit(0, 0.01, 0)).toBe(0);
  });
  it('an earlier time for the same key wins', () => {
    const f = new Frontier();
    f.add('a', 3000, 5); f.add('a', 2000, 5);
    expect(f.first).toBe(2000);
    f.done('a');
    expect(f.size).toBe(0);
  });
});

describe('Throughput', () => {
  it('measures work per wall ms while busy, ignores idle time, guesses until measured', () => {
    let now = 0;
    const r = new Throughput(0.3, () => now);
    expect(r.value).toBe(0.3);
    r.busy();
    now = 100; r.done(50);
    expect(r.measured).toBe(false);
    now = 300; r.done(50);
    expect(r.value).toBeCloseTo(100 / 300, 5);
    r.idle(); now = 100_000; r.done(5);
    expect(r.value).toBeCloseTo(100 / 300, 5);
  });
});

describe('pinning: promised sprites survive what is built next', () => {
  const sp = (b: number) => ({ bytes: b, canvas: { width: 1, height: 1 } });
  it('a pinned sprite is never evicted, an unpinned one goes back to the LRU', () => {
    const c = new SpriteCache<ReturnType<typeof sp>>(300);
    const a = new Ahead(c);
    c.put('p', sp(100));
    a.hold('p', 5000);
    for (let i = 0; i < 6; i++) c.put(`x${i}`, sp(100));
    expect(c.peek('p')).toBeDefined();
    expect(c.bytes).toBeLessThanOrEqual(300 + 100);
    a.release(4999);
    expect(c.pinnedBytes).toBe(100);
    a.release(5000);
    expect(c.pinnedBytes).toBe(0);
    c.put('y', sp(100)); c.put('z', sp(100)); c.put('w', sp(100));
    expect(c.peek('p')).toBeUndefined();
  });
  it('a sprite that lands after it was wanted is pinned on arrival', () => {
    const c = new SpriteCache<ReturnType<typeof sp>>(1000);
    const a = new Ahead(c);
    a.hold('late', 100);
    c.put('late', sp(10), a.wants('late'));
    expect(c.pinnedBytes).toBe(10);
  });
});

describe('Stall: buffering for sprites, only when really behind', () => {
  const clip = () => ({ paused: false, seeking: false, ended: false, pause() { this.paused = true; }, play() { this.paused = false; } });
  it('pauses for a deficit, resumes when it is gone, never for a small one or a paused / seeking clip', async () => {
    vi.useFakeTimers();
    const v = clip();
    let d = 500;
    const s = new Stall(() => v, () => d);
    s.consider(10);
    expect(v.paused).toBe(false);
    s.consider(500);
    expect(v.paused).toBe(true);
    expect(s.active).toBe(true);
    d = 0;
    await vi.advanceTimersByTimeAsync(100);
    expect(v.paused).toBe(false);
    expect(s.stalls).toBe(1);
    const p = clip(); p.seeking = true;
    const s2 = new Stall(() => p, () => 9);
    s2.consider(900);
    expect(p.paused).toBe(false);
    vi.useRealTimers();
  });
  it('a hold is bounded, and the viewer pressing play wins', async () => {
    vi.useFakeTimers();
    const v = clip();
    const s = new Stall(() => v, () => 1e9);
    s.consider(900);
    await vi.advanceTimersByTimeAsync(3500);
    expect(v.paused).toBe(false);
    const w = clip();
    const s3 = new Stall(() => w, () => 1e9);
    s3.consider(900);
    s3.userPlayed();
    expect(s3.active).toBe(false);
    vi.useRealTimers();
  });
});
