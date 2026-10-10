import { afterEach, describe, expect, it, vi } from 'vitest';

import { prepareLine } from '../src/anim/Prepared';
import type { CanvasPath } from '../src/canvas/CanvasPath';
import { MinHeap } from '../src/canvas/warm/heap';
import { WarmPlanner, type Builder, type Entry, type Lines } from '../src/canvas/warm/planner';
import { Timeline } from '../src/core/Timeline';
import { parseScript } from '../src/parser/ScriptParser';
import type { LineEnv } from '../src/render/LineView';

const HEAD = '[Script Info]\nPlayResX: 640\nPlayResY: 360\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
const fonts = { resolve: () => ({ family: 'Arial', weight: 400, italic: false, ratio: 1 }) };
const T = (ms: number): string => `0:00:${String(Math.floor(ms / 1000)).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 10)).padStart(2, '0')}`;
const ev = (s: number, e: number, tags: string, text = 'K'): string => `Dialogue: 0,${T(s)},${T(e)},Default,,0,0,0,,{\\an5\\pos(10,10)${tags}}${text}\n`;
const ANIM = '\\blur2\\t(0,900,\\fscx150\\fscy150\\blur6)';

const make = (text: string, o: { cap?: number; mode?: string } = {}) => {
  const sc = parseScript(HEAD + text);
  const tl = new Timeline(sc.events.map((e) => prepareLine(e, sc.styles, sc.info)));
  const env = { layout: { width: 640, height: 360 }, styles: sc.styles, borderScale: 1, blurScale: 1, devScale: 1, fonts } as unknown as LineEnv;
  const have = new Set<string>();
  const path = {
    mode: () => o.mode ?? 'canvas', busy: () => true,
    complexity: (l: { event: { fragments: unknown[] } }) => ({ eligible: true, reason: '', score: 4, animated: new Set(l.event.fragments.length ? ['blur', 'fs', 'fscx'] : []) }),
    cache: { peek: (k: string) => (have.has(k) ? {} : undefined), has: (k: string) => have.has(k), pin: () => true, unpin: () => undefined, pinnedBytes: 0, capBytes: o.cap ?? 96 << 20 },
  } as unknown as CanvasPath;
  let covers: ((t: number) => boolean) | null = null;
  const lines = (): Lines => ({ startingIn: (a, b) => tl.startingIn(a, b), visibleAt: (t) => tl.visibleAt(t), startMs: (l) => tl.startMs(l), covers });
  const taken: Entry[] = [];
  let full = false;
  const builder: Builder = { take: (e) => { if (full) return 'full'; taken.push(e); have.add(e.key); return 'done'; }, cost: () => 0 };
  const step = (p: WarmPlanner, t: number, frameMs: number, budget: number, exempt = true) => {
    if (p.isSeek(t)) p.seek(t, lines());
    return p.step(t, env, frameMs, budget, lines(), builder, exempt);
  };
  return { step, env, path, lines, taken, builder, setCovers: (f: ((t: number) => boolean) | null) => { covers = f; }, setFull: (v: boolean) => { full = v; }, have };
};

afterEach(() => vi.restoreAllMocks());

describe('MinHeap', () => {
  it('pops in priority order and keeps insertion order for ties', () => {
    const h = new MinHeap<{ p: number; n: string }>((x) => x.p);
    [[5, 'e'], [1, 'a'], [3, 'c'], [1, 'b'], [4, 'd']].forEach(([p, n]) => h.push({ p: p as number, n: n as string }));
    const out: string[] = [];
    while (h.size) out.push(h.pop()!.n);
    expect(out.join('')).toBe('abcde');
    expect(h.pop()).toBeUndefined();
  });
});

describe('warm plan', () => {
  it('builds in the order sprites are first drawn, not in the order events start', () => {
    // A starts first but runs long (late frames); B starts a little later: B's first frame comes before A's later frames.
    const m = make(ev(1000, 2800, ANIM, 'A') + ev(1200, 1300, '\\blur3', 'B'));
    const p = new WarmPlanner(m.path);
    m.step(p, 0, 1000 / 24, 1e9);
    const ms = m.taken.map((e) => e.ms);
    expect(ms.length).toBeGreaterThan(3);
    expect(ms).toEqual([...ms].sort((a, b) => a - b));
    const b = m.taken.findIndex((e) => e.spec.text === 'B');
    expect(m.taken.slice(b + 1).some((e) => e.spec.text === 'A')).toBe(true);
  });

  it('finishes in slices without planning or building a sprite twice', () => {
    const m = make([0, 1, 2, 3].map((i) => ev(1000 + i, 2000, ANIM, `K${i}`)).join(''));
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 1));
    const p = new WarmPlanner(m.path);
    let slices = 0, more = true;
    while (more && slices < 400) { more = m.step(p, 0, 1000 / 24, 4).more; slices++; }
    expect(more).toBe(false);
    expect(slices).toBeGreaterThan(1);
    expect(new Set(m.taken.map((e) => e.key)).size).toBe(m.taken.length);
    expect(m.taken.length).toBeGreaterThan(4);
    expect(m.step(p, 0, 1000 / 24, 4)).toEqual({ built: 0, more: false, waiting: false });
  });

  it('plans nothing for a quiet scene in auto mode', () => {
    const m = make(ev(1000, 2000, ''), { mode: 'auto' });
    (m.path as unknown as { busy: () => boolean }).busy = () => false;
    const p = new WarmPlanner(m.path);
    expect(m.step(p, 0, 41.7, 1e9).built).toBe(0);
  });

  it('a seek starts the plan over at the new time (no replay of the time between), playing on does not', () => {
    const m = make(ev(1000, 1500, '\\blur2') + ev(30000, 30500, '\\blur2', 'Z') + ev(40000, 40500, '\\blur2', 'Y'));
    const p = new WarmPlanner(m.path);
    m.step(p, 500, 41.7, 1e9);
    m.step(p, 540, 41.7, 1e9);
    expect(p.restarts).toBe(1);
    expect(m.taken.map((e) => e.spec.text)).toEqual(['K', 'Z', 'Y']); // a 60 s horizon sees them all at once
    m.step(p, 29000, 41.7, 1e9);
    expect(p.restarts).toBe(2);
    expect(m.taken.map((e) => e.spec.text)).toEqual(['K', 'Z', 'Y']); // the planner keeps the already planned horizon
    m.step(p, 100, 41.7, 1e9); // backwards
    expect(p.restarts).toBe(3);
    expect(p.planned).toBeGreaterThanOrEqual(10000);
  });

  it('lines already running at a seek still get their later frames planned', () => {
    const m = make(ev(1000, 3000, ANIM, 'R'));
    const p = new WarmPlanner(m.path);
    m.step(p, 1900, 1000 / 24, 1e9);
    expect(m.taken.length).toBeGreaterThan(0);
    expect(m.taken.every((e) => e.until >= 1900)).toBe(true);
  });

  it('does not plan past what the window has loaded, and picks the rest up when it arrives', () => {
    const m = make(ev(1000, 1500, '\\blur2', 'A') + ev(6000, 6500, '\\blur2', 'B'));
    m.setCovers((t) => t < 3000);
    const p = new WarmPlanner(m.path);
    m.step(p, 0, 41.7, 1e9);
    expect(m.taken.map((e) => e.spec.text)).toEqual(['A']);
    expect(p.planned).toBeLessThanOrEqual(3000);
    m.setCovers(null);
    m.step(p, 40, 41.7, 1e9);
    expect(m.taken.map((e) => e.spec.text)).toEqual(['A', 'B']);
  });

  it('plans no more than the cache can hold next to what is needed sooner, and continues as sprites fall due', () => {
    const text = [0, 1, 2, 3, 4, 5].map((i) => ev(1000 + i * 1000, 1500 + i * 1000, `\\blur${i + 1}\\fs60`, `G${i}`)).join('');
    const m = make(text, { cap: 6000 });
    const p = new WarmPlanner(m.path);
    const all = (t: number): void => { m.step(p, t, 41.7, 1e9); };
    all(0);
    const first = m.taken.length;
    expect(first).toBeGreaterThanOrEqual(1);
    expect(first).toBeLessThan(6);
    expect(p.aheadMB * 1048576).toBeLessThanOrEqual(3000 + 40000); // at most the share plus the one that always fits
    for (let t = 1500; t <= 7000; t += 500) all(t);
    expect(m.taken.length).toBe(6);
    expect(m.taken.map((e) => e.ms)).toEqual([...m.taken.map((e) => e.ms)].sort((a, b) => a - b));
  });

  it('a full builder stops the slice, loses nothing and resumes', () => {
    const m = make(ev(1000, 1500, '\\blur2', 'A') + ev(1100, 1600, '\\blur3', 'B'));
    const p = new WarmPlanner(m.path);
    m.setFull(true);
    const r = m.step(p, 0, 41.7, 1e9);
    expect(r).toMatchObject({ built: 0, waiting: true });
    m.setFull(false);
    m.step(p, 10, 41.7, 1e9);
    expect(m.taken.map((e) => e.spec.text)).toEqual(['A', 'B']);
  });

  it('readyUntil never reaches a frame whose sprite is still with a builder', () => {
    const m = make(ev(1000, 1500, '\\blur2', 'A'));
    const p = new WarmPlanner(m.path);
    // A worker-like builder: the job is dispatched but the bitmap has not landed (nothing is added to the cache).
    const out: Entry[] = [];
    const b: Builder = { take: (e) => { out.push(e); return 'done'; }, cost: () => 0 };
    const step = (t: number): void => { if (p.isSeek(t)) p.seek(t, m.lines()); p.step(t, m.env, 41.7, 1e9, m.lines(), b, true); };
    step(0);
    expect(out.length).toBeGreaterThan(0);
    const first = Math.min(...out.map((e) => e.ms));
    expect(p.readyUntil()).toBeLessThanOrEqual(first - 1);
    // every dispatch lands: the horizon is the planned coverage again.
    for (const e of out) { m.have.add(e.key); p.landed(e.key); }
    step(40);
    expect(p.readyUntil()).toBeGreaterThanOrEqual(1500);
  });

  it('a promised sprite pushed out of the cache pulls the ready horizon back to its frame', () => {
    const m = make(ev(1000, 1500, '\\blur2', 'A'));
    const p = new WarmPlanner(m.path);
    m.step(p, 0, 41.7, 1e9); // the default builder lands everything at once
    expect(p.readyUntil()).toBeGreaterThan(2000);
    expect(m.taken.length).toBeGreaterThan(0);
    const victim = m.taken[0]; // the (time-constant) sprite promised from ms 1001
    m.have.delete(victim.key); // pushed out of the cache after the plan called it done
    m.step(p, 40, 41.7, 1e9);
    expect(p.readyUntil()).toBeLessThanOrEqual(victim.ms - 1);
  });
});
