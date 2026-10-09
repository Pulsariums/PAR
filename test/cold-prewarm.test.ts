import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasPath } from '../src/canvas/CanvasPath';
import { analyzeLine } from '../src/canvas/eligibility';
import { planLine } from '../src/canvas/plan';
import { SpriteCache } from '../src/canvas/SpriteCache';
import { spriteRequestSamples } from '../src/canvas/sprites';
import { Expander, MAX_SLICE_REQUESTS, PREPARE_LINE_THRESHOLD } from '../src/canvas/warm/expand';
import { WarmPlanner, type Builder, type Entry } from '../src/canvas/warm/planner';
import { COLD_RANGE_MS, Lookahead } from '../src/core/Lookahead';
import { ev, kit } from './helpers/warmKit';

const pump = (la: Lookahead): void => (la as unknown as { pump(): void }).pump();
const dense = (start = 2000): string => Array.from({ length: 16 }, (_, i) => ev(start + i * 20, 7000, `\\bord1\\blur2\\fs${20 + i}`, `K${i}`)).join('');

afterEach(() => vi.restoreAllMocks());

describe('bounded cold-scene prewarming', () => {
  it('forces preparation when a pending scene exceeds the temperature threshold', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const makeDense = (count: number) => kit(Array.from({ length: count }, (_, i) => ev(1000, 1500, '', `K${i}`)).join(''), { mode: 'auto' });
    const run = (count: number): number => {
      const k = makeDense(count);
      k.path.busy = () => false;
      k.path.complexity = () => ({ eligible: true, reason: '', score: 0, animated: new Set() });
      const expander = new Expander();
      expander.restart(0, k.lines());
      const requests: number[] = [];
      expander.run(k.path, 0, k.env, 1000 / 24, k.lines(), 2000, () => true, () => 1000, (r) => requests.push(r.ms));
      return requests.length;
    };
    expect(PREPARE_LINE_THRESHOLD).toBe(50);
    expect(run(PREPARE_LINE_THRESHOLD)).toBe(0);
    expect(run(PREPARE_LINE_THRESHOLD + 1)).toBeGreaterThan(0);
  });

  it('defers work until after render, then first arrival finds exact sprites in the shared cache', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const k = kit(dense(), { mode: 'auto' });
    k.path.complexity = analyzeLine;
    k.path.busy = () => false;
    const cache = new SpriteCache<never>(96 << 20);
    Object.assign(k.path, { cache });
    const build = vi.fn((key: string) => cache.store(key, () => ({ bytes: 4, canvas: { width: 1, height: 1 } }) as never));
    k.path.prebuild = build;
    const la = new Lookahead(k.path, k.lines, () => 'off');
    const items = k.lines().visibleAt(2500).map((l) => planLine(l, 2500 - k.lines().startMs(l), k.env, analyzeLine(l).animated, { blur: 0 }));
    const resolve = (): { missing: unknown[] } => (CanvasPath.prototype as unknown as { resolve(this: unknown, r: unknown): { missing: unknown[] } }).resolve.call({ cache, skipped: 0 }, [{ items }]);
    expect(resolve().missing).toHaveLength(16);
    la.note(0, k.env, null);
    expect(build).not.toHaveBeenCalled();
    for (let i = 0; i < 30; i++) pump(la);
    expect(build).toHaveBeenCalledTimes(16);
    expect(resolve().missing).toHaveLength(0);
    expect(cache.prewarmed).toBe(16);
    expect(cache.pinnedBytes).toBeGreaterThan(0);
    la.note(2500, k.env, 1);
    for (let i = 0; i < 20; i++) pump(la);
    expect(build).toHaveBeenCalledTimes(16);
    la.dispose();
  });

  it('resumes dense animation samples under the per-slice bound and does not expand beyond four seconds', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const k = kit(ev(1000, 59000, '\\t(0,58000,\\blur100)', 'A') + dense(9000));
    const expander = new Expander();
    expander.restart(0, k.lines());
    const requests: number[] = [];
    let more = true;
    while (more) {
      const before = requests.length;
      more = expander.run(k.path, 0, k.env, 1000 / 24, k.lines(), COLD_RANGE_MS, () => true, () => 4, (r) => requests.push(r.ms)).more;
      expect(requests.length - before).toBeLessThanOrEqual(MAX_SLICE_REQUESTS);
    }
    expect(requests.length).toBeGreaterThan(1);
    expect(requests.every((t) => t >= 1000 && t < COLD_RANGE_MS)).toBe(true);
    expect(expander.frontier).toBe(COLD_RANGE_MS);
    const at = 5000;
    const line = k.lines().visibleAt(at)[0];
    const key = planLine(line, at - k.lines().startMs(line), k.env, k.path.complexity(line).animated, { blur: 0 }).key;
    const la = new Lookahead(k.path, k.lines, () => 'off');
    la.note(0, k.env, null);
    for (let i = 0; i < 20; i++) pump(la);
    expect(k.cache.has(key)).toBe(false);
    la.note(2000, k.env, 1);
    for (let i = 0; i < 30; i++) pump(la);
    expect(k.cache.has(key)).toBe(true);
    la.dispose();
  });

  it('recognizes density from overlapping survivors, not just the number of new starts', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const k = kit(Array.from({ length: 8 }, (_, i) => ev(500 + i * 400, 6000, '\\bord1\\blur2', `K${i}`)).join(''), { mode: 'auto' });
    k.path.busy = () => false;
    k.path.complexity = analyzeLine;
    const la = new Lookahead(k.path, k.lines, () => 'off');
    la.note(0, k.env, null);
    for (let i = 0; i < 30; i++) pump(la);
    expect(k.built).toHaveLength(8);
    la.dispose();
  });

  it('stops at queue and loaded-window bounds and resumes when coverage arrives', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const k = kit(Array.from({ length: 800 }, (_, i) => ev(2000, 6000, '', String.fromCharCode(0x400 + i))).join(''));
    k.path.complexity = (l) => ({ ...analyzeLine(l), eligible: true, animated: new Set() });
    let covered = 1500;
    const lines = () => ({ ...k.lines(), covers: (t: number) => t < covered });
    const planner = new WarmPlanner(k.path);
    const builder: Builder = { cost: () => 0, take: () => 'full' };
    planner.seek(0, lines());
    planner.step(0, k.env, 1000 / 24, 4, lines(), builder, true, COLD_RANGE_MS);
    expect(planner.blocked).toBe(true);
    expect(planner.queued).toBe(0);
    covered = 5000;
    for (let i = 0; i < 50; i++) planner.step(0, k.env, 1000 / 24, 4, lines(), builder, true, COLD_RANGE_MS);
    expect(planner.queued).toBe(512);
    const taken: Entry[] = [];
    builder.take = (e) => { taken.push(e); k.cache.set(e.key, {}); return 'done'; };
    for (let i = 0; i < 50; i++) {
      const result = planner.step(0, k.env, 1000 / 24, 4, lines(), builder, true, COLD_RANGE_MS);
      expect(result.built).toBeLessThanOrEqual(MAX_SLICE_REQUESTS);
    }
    expect(taken).toHaveLength(800);
    expect(new Set(taken.map((e) => e.key)).size).toBe(800);
  });

  it('cancels scheduled cold work on replacement and latest seek wins', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => { callbacks.push(cb); return callbacks.length; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const k = kit(dense() + dense(12000));
    const la = new Lookahead(k.path, k.lines, () => 'off');
    la.note(0, k.env, null);
    la.clear();
    callbacks[0](0);
    expect(k.built).toHaveLength(0);
    la.note(0, k.env, null);
    la.begin(10000, k.env);
    la.begin(30000, k.env);
    callbacks[1](0);
    pump(la);
    expect(k.built).toHaveLength(0);
    la.dispose();
    vi.unstubAllGlobals();
  });

  it('uses exact snapped sample keys, including fractional frame rates', () => {
    const k = kit(ev(1010, 7000, '\\t(0,5990,\\blur20)', 'A'));
    const line = k.lines().visibleAt(2000)[0];
    const frame = 1000 / (24000 / 1001);
    const requests = [...spriteRequestSamples(line, k.env, k.path.complexity(line).animated, frame, 1010, undefined, false, [2000, 4000])];
    expect(requests.length).toBeLessThan(50);
    for (const r of requests) expect(r.key).toBe(planLine(line, r.ms - 1010, k.env, k.path.complexity(line).animated, { blur: 0 }).key);
  });
});
