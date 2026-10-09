import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasPath } from '../src/canvas/CanvasPath';
import { SpritePool } from '../src/canvas/workers/pool';
import { Lookahead } from '../src/core/Lookahead';

import { fakeWorker, hostDeps, wait } from './helpers/fakeWorker';
import { ev, kit } from './helpers/warmKit';

const made: { pools: SpritePool[]; worker: ReturnType<typeof fakeWorker> | null; calls: number; mute: boolean } = { pools: [], worker: null, calls: 0, mute: false };
vi.mock('../src/canvas/workers/create', () => ({
  createSpritePool: (_o: unknown, hooks: ConstructorParameters<typeof SpritePool>[2]) => {
    made.calls++;
    const w = fakeWorker(hostDeps());
    made.worker = w;
    const post = w.postMessage.bind(w);
    w.postMessage = ((m: { op: string }) => { if (!(made.mute && m.op === 'build')) post(m as never); }) as never;
    const p = new SpritePool(() => w, 1, hooks);
    made.pools.push(p);
    return p;
  },
}));

afterEach(() => { made.pools.length = 0; made.worker = null; made.calls = 0; made.mute = false; vi.restoreAllMocks(); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); });

const pump = (la: Lookahead): void => (la as unknown as { pump(): void }).pump();
const burst = ev(2000, 2800, '\\blur2', 'A') + ev(2100, 2900, '\\blur3', 'B') + ev(4000, 4800, '\\blur2', 'C');

describe('look-ahead and its workers', () => {
  let perfNow = 0;
  beforeEach(() => { perfNow = 0; vi.spyOn(performance, 'now').mockImplementation(() => perfNow); });
  afterEach(() => { vi.restoreAllMocks(); });
  it('starts no worker until a sprite could use one (a quiet page never pays for threads)', () => {
    const k = kit(ev(1000, 2000, ''), { mode: 'auto' });
    (k.path as unknown as { busy: () => boolean }).busy = () => false;
    const la = new Lookahead(k.path, k.lines, () => 'auto');
    la.note(0, k.env, null);
    expect(made.calls).toBe(0);
  });

  it('while workers boot, far sprites wait for them and imminent ones are built at once; when ready the rest goes to the workers', async () => {
    const k = kit(burst);
    const la = new Lookahead(k.path, k.lines, () => 'auto');
    la.note(1000, k.env, 1);
    pump(la);
    expect(made.calls).toBe(1);
    expect(k.built.length).toBeGreaterThan(0); // A and B start within 1.5 s of the playhead
    const imminent = k.built.length;
    await wait();
    la.note(1020, k.env, 1);
    pump(la);
    await wait();
    expect(la.stats().workerBuilt).toBeGreaterThan(0);
    expect(k.built.length).toBe(imminent);
    expect(k.cache.size).toBeGreaterThan(imminent);
  });

  it('a pool that dies hands its in-flight sprites back: they are planned again and built on the main thread, once', async () => {
    const k = kit(ev(3000, 3800, '\\blur2', 'A') + ev(3100, 3900, '\\blur3', 'B'));
    const la = new Lookahead(k.path, k.lines, () => 'auto');
    made.mute = true; // the worker never answers: its jobs stay pending
    la.note(0, k.env, 1);
    pump(la); // cold planning is deferred until after paint
    await wait();
    la.note(20, k.env, 1);
    pump(la); // submits to the ready worker
    expect(made.pools[0].pending).toBeGreaterThan(0);
    made.worker!.fire('error', { message: 'boom' });
    expect(la.stats().workers).toBe(0);
    la.note(40, k.env, 1);
    pump(la);
    await wait();
    const keys = k.built.slice();
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
    expect(made.calls).toBe(1); // never respawned
  });

  it('a seek drops what the workers still build for the old plan', async () => {
    const k = kit(burst);
    const la = new Lookahead(k.path, k.lines, () => 'auto');
    la.note(0, k.env, 1);
    pump(la); // cold planning is deferred until after paint
    await wait();
    const inv = vi.spyOn(made.pools[0], 'invalidate');
    la.note(20, k.env, 1);
    expect(inv).not.toHaveBeenCalled(); // playing on
    la.note(60_000, k.env, 1);
    expect(inv).toHaveBeenCalledTimes(1);
  });

  it('prewarms a cold upcoming scene through workers and drops late results after replacement', async () => {
    const k = kit(ev(3000, 3800, '\\blur2', 'A'));
    const la = new Lookahead(k.path, k.lines, () => 'auto');
    la.note(0, k.env, null);
    expect(k.cache.size).toBe(0);
    pump(la); // starts the pool; the far sprite waits for worker boot
    await wait();
    pump(la);
    await wait();
    expect(k.cache.size).toBe(1);
    expect(k.built).toHaveLength(0);
    expect(la.stats().workerBuilt).toBe(1);
    la.begin(3000, k.env);
    expect(k.cache.size).toBe(1);
    la.dispose();

    const cold = kit(ev(3000, 3800, '\\blur2', 'B'));
    made.mute = true;
    const pending = new Lookahead(cold.path, cold.lines, () => 'auto');
    pending.note(0, cold.env, null);
    pump(pending);
    await wait();
    pump(pending);
    expect(made.pools[made.pools.length - 1].pending).toBe(1);
    pending.clear();
    const close = vi.fn();
    made.worker!.fire('message', { data: { op: 'built', gen: 0, items: [{ id: 1, bitmap: { width: 1, height: 1, close }, w: 1, h: 1, boxW: 1, ox: 0, oy: 0, bytes: 4 }] } });
    expect(cold.cache.size).toBe(0);
    expect(close).toHaveBeenCalledOnce();
    pending.dispose();
  });

  it('a hidden tab does not pump', async () => {
    const k = kit(Array.from({ length: 60 }, (_v, i) => ev(1000 + i * 50, 1800 + i * 50, `\\blur${2 + (i % 5)}\\fs${30 + i}`, `K${i}`)).join(''));
    const la = new Lookahead(k.path, k.lines, () => 'off');
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 0.25)); // every look costs time: no slice finishes the plan
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    la.note(0, k.env, 1);
    const before = k.built.length;
    pump(la);
    pump(la);
    expect(k.built.length).toBe(before);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    for (let i = 0; i < 40 && k.built.length === before; i++) pump(la);
    expect(k.built.length).toBeGreaterThan(before);
  });

  it('dispose terminates the workers and a later note starts nothing', async () => {
    const k = kit(burst);
    const la = new Lookahead(k.path, k.lines, () => 'auto');
    la.note(0, k.env, 1);
    pump(la); // cold planning is deferred until after paint
    await wait();
    la.dispose();
    expect(made.worker!.terminate).toHaveBeenCalled();
    expect(la.stats().workers).toBe(0);
  });
});

describe('the frame path never builds', () => {
  const item = { key: 'k', alpha: 1, clip: [], spec: { plates: [] } } as never;
  const sprite = { canvas: { width: 1, height: 1 }, w: 1, h: 1, boxW: 1, ox: 0, oy: 0, bytes: 4 };
  const resolve = (p: CanvasPath) => (p as unknown as { resolve(r: unknown): { missing: unknown[]; resolved: unknown[][] } }).resolve([{ layer: 0, index: 0, items: [item] }]);

  it('a sprite that is not there is reported missing, never built, never reduced; a cached one is used', () => {
    const p = new CanvasPath({ insert: () => undefined } as never, () => 'canvas', 1 << 20);
    const pre = vi.spyOn(p, 'prebuild');
    const r = resolve(p);
    expect(r.missing).toHaveLength(1);
    expect(r.resolved[0][0]).toBeNull();
    expect(pre).not.toHaveBeenCalled();
    p.cache.store('k', () => sprite as never);
    expect(resolve(p).resolved[0][0]).toBe(sprite);
    expect(resolve(p).missing).toHaveLength(0);
  });
});
