import { describe, expect, it, vi } from 'vitest';

import { SliceBudget, IDLE_SLICE_MS, MAX_SLICE_MS, MIN_SLICE_MS } from '../src/canvas/warm/budget';
import { SpriteCache } from '../src/canvas/SpriteCache';
import { attachSpriteHost, type HostScope } from '../src/canvas/workers/host';
import { SpritePool } from '../src/canvas/workers/pool';
import type { FromSprite, ToSprite } from '../src/canvas/workers/protocol';
import { debugWorkers, poolSize } from '../src/canvas/workers/size';
import type { SpriteSpec } from '../src/canvas/types';
import { resolveOptions } from '../src/core/options';

const spec = (text: string, family = '"Arial", sans-serif'): SpriteSpec => ({ text, family, weight: 400, italic: false, size: 40, ratio: 1, rx: 1, spacing: 0, kerning: false, plates: [], scale: 1 });

describe('slice budget adapts to the machine', () => {
  it('a fast machine with cheap frames takes long slices, a slow one short ones', () => {
    const fast = new SliceBudget();
    const slow = new SliceBudget();
    for (let i = 0; i < 20; i++) { fast.noteFrame(3, 16.7); slow.noteFrame(30, 41.7); }
    expect(fast.slice(true, 0)).toBeGreaterThan(5);
    expect(fast.slice(true, 0)).toBeLessThanOrEqual(MAX_SLICE_MS);
    expect(slow.slice(true, 0)).toBeLessThan(fast.slice(true, 0));
    expect(slow.slice(true, 0)).toBeGreaterThanOrEqual(MIN_SLICE_MS);
  });
  it('late frames cap the slice, an idle player gets the long one, a frame that fills its interval leaves the minimum', () => {
    const b = new SliceBudget();
    for (let i = 0; i < 20; i++) b.noteFrame(3, 16.7);
    expect(b.slice(true, 0.5)).toBeLessThanOrEqual(2);
    expect(b.slice(false, null)).toBe(IDLE_SLICE_MS);
    const c = new SliceBudget();
    for (let i = 0; i < 20; i++) c.noteFrame(50, 41.7);
    expect(c.slice(true, 0)).toBe(MIN_SLICE_MS);
  });
  it('learns the cost of one build', () => {
    const b = new SliceBudget();
    b.noteBuilds(10, 5);
    expect(b.perBuild).toBeCloseTo(0.5);
    b.noteBuilds(0, 99);
    expect(b.perBuild).toBeCloseTo(0.5);
  });
});

describe('pool size', () => {
  it('follows the cores, one on two or fewer, never more than four, none when unavailable or off', () => {
    expect(poolSize('auto', 2, true)).toBe(1);
    expect(poolSize('auto', 1, true)).toBe(0); // one core: a worker would only take the page thread's time
    expect(poolSize('auto', undefined, true)).toBe(1);
    expect(poolSize('auto', 4, true)).toBe(2);
    expect(poolSize('auto', 8, true)).toBe(4);
    expect(poolSize('auto', 32, true)).toBe(4);
    expect(poolSize('auto', 8, false)).toBe(0);
    expect(poolSize('off', 8, true)).toBe(0);
    expect(poolSize(3, 2, true)).toBe(3);
    expect(poolSize(9, 2, true)).toBe(4);
    expect(poolSize(0, 8, true)).toBe(0);
  });
  it('only the internal switch changes the default, and the public options have no such field', () => {
    expect(debugWorkers()).toBe('auto');
    (globalThis as { __PAR_SPRITE_WORKERS?: unknown }).__PAR_SPRITE_WORKERS = 'off';
    expect(debugWorkers()).toBe('off');
    (globalThis as { __PAR_SPRITE_WORKERS?: unknown }).__PAR_SPRITE_WORKERS = 2;
    expect(debugWorkers()).toBe(2);
    delete (globalThis as { __PAR_SPRITE_WORKERS?: unknown }).__PAR_SPRITE_WORKERS;
    expect('spriteWorkers' in resolveOptions({ container: document.body })).toBe(false);
  });
});

/** The sprite host wired to a double, and a Worker double that runs it on the next tick. */
const fakeWorker = (deps: Parameters<typeof attachSpriteHost>[1]) => {
  const listeners: Array<(e: { data: unknown }) => void> = [];
  let hostFn: (e: { data: ToSprite }) => void = () => undefined;
  const scope: HostScope = {
    postMessage: (m: FromSprite) => { setTimeout(() => listeners.forEach((l) => l({ data: m })), 0); },
    addEventListener: (_t, fn) => { hostFn = fn; },
  };
  attachSpriteHost(scope, deps);
  const w = {
    postMessage: (m: ToSprite) => { setTimeout(() => hostFn({ data: m }), 0); },
    addEventListener: (type: string, fn: (e: { data: unknown }) => void) => { if (type === 'message') listeners.push(fn); },
    terminate: vi.fn(),
  };
  return w as unknown as Worker;
};
const wait = (ms = 20): Promise<void> => new Promise((r) => setTimeout(r, ms));
const bitmap = (): ImageBitmap => ({ close: vi.fn(), width: 4, height: 4 } as unknown as ImageBitmap);

describe('sprite pool with a worker double', () => {
  const deps = (log: string[]) => ({
    supported: () => true,
    blur: () => true,
    reset: () => undefined,
    build: (s: SpriteSpec) => { log.push(`build ${s.text}`); return { bitmap: bitmap(), w: 4, h: 4, boxW: 3, ox: 1, oy: 2, bytes: 64 }; },
    addFace: async (f: { family: string }) => { log.push(`face ${f.family}`); },
    removeFace: (k: string) => { log.push(`drop ${k}`); },
  });

  it('delivers built sprites by key, in jobs sent after the fonts they need', async () => {
    const log: string[] = [];
    const got = new Map<string, unknown>();
    const pool = new SpritePool(() => fakeWorker(deps(log)), 1, { built: (k, s) => got.set(k, s), free: () => undefined, failed: () => undefined });
    pool.setFaces([{ key: 'f1', family: 'Berylium', weight: 400, italic: false, data: new Uint8Array(8) }]);
    await wait();
    expect(pool.ready).toBe(true);
    expect(pool.accepts(spec('A', '"Berylium", sans-serif'), 'k1')).toBe(true); // ships the face the sprite needs
    expect(pool.submit('k1', spec('A'))).toBe(true);
    expect(pool.submit('k1', spec('A'))).toBe(true); // already on its way
    expect(pool.submit('k2', spec('B'))).toBe(true);
    pool.flush();
    expect(pool.pending).toBe(2);
    await wait();
    expect(log[0]).toBe('face Berylium');
    expect(log.filter((l) => l.startsWith('build'))).toEqual(['build A', 'build B']);
    expect(got.get('k1')).toMatchObject({ w: 4, h: 4, boxW: 3, ox: 1, oy: 2, bytes: 64 });
    expect(pool.pending).toBe(0);
    expect(pool.received).toBe(2);
  });

  it('results of an invalidated generation are dropped and their bitmaps freed', async () => {
    const log: string[] = [];
    const got: string[] = [];
    const closed: Array<ReturnType<typeof vi.fn>> = [];
    const d = deps(log);
    d.build = (s) => { const b = bitmap(); closed.push(b.close as never); return { bitmap: b, w: 1, h: 1, boxW: 1, ox: 0, oy: 0, bytes: 4 + s.text.length * 0 }; };
    const pool = new SpritePool(() => fakeWorker(d), 1, { built: (k) => got.push(k), free: () => undefined, failed: () => undefined });
    await wait();
    pool.submit('old', spec('A'));
    pool.flush();
    pool.invalidate();
    await wait();
    expect(got).toEqual([]);
    expect(closed[0]).toHaveBeenCalled();
  });

  it('a worker that cannot do canvas text fails the pool so the main thread takes over', async () => {
    const reasons: string[] = [];
    const d = { ...deps([]), supported: () => false };
    const pool = new SpritePool(() => fakeWorker(d), 1, { built: () => undefined, free: () => undefined, failed: (r) => reasons.push(r) });
    await wait();
    expect(pool.dead).toBe(true);
    expect(pool.ready).toBe(false);
    expect(reasons).toHaveLength(1);
    expect(pool.submit('k', spec('A'))).toBe(false);
  });

  it('leaves sprites of oversized fonts to the main thread', async () => {
    const pool = new SpritePool(() => fakeWorker(deps([])), 1, { built: () => undefined, free: () => undefined, failed: () => undefined });
    await wait();
    pool.setFaces([{ key: 'big', family: 'HugeCJK', weight: 400, italic: false, data: { byteLength: 30 << 20, slice: () => new Uint8Array(1) } as unknown as Uint8Array }]);
    expect(pool.accepts(spec('A', '"HugeCJK", sans-serif'), 'k1')).toBe(false);
    expect(pool.accepts(spec('A', '"Arial", sans-serif'), 'k2')).toBe(true);
  });

  it('holds back when every worker already has its share', async () => {
    const pool = new SpritePool(() => fakeWorker(deps([])), 1, { built: () => undefined, free: () => undefined, failed: () => undefined });
    await wait();
    let n = 0;
    while (pool.submit(`k${n}`, spec('A'))) n++;
    expect(n).toBe(16);
  });
});

describe('sprite cache with bitmaps', () => {
  it('put stores a sprite built elsewhere once and counts it as built ahead', () => {
    const c = new SpriteCache<{ bytes: number; canvas?: { width: number; height: number; close?: () => void } }>(1000);
    const a = { bytes: 10, canvas: { width: 1, height: 1, close: vi.fn() } };
    const dup = { bytes: 10, canvas: { width: 1, height: 1, close: vi.fn() } };
    expect(c.put('k', a)).toBe(true);
    expect(c.put('k', dup)).toBe(false);
    expect(c.prewarmed).toBe(1);
    c.sweep();
    expect(dup.canvas.close).toHaveBeenCalled();
    expect(a.canvas.close).not.toHaveBeenCalled();
  });
  it('an evicted bitmap is closed at the next sweep, not while a frame may still draw it', () => {
    const c = new SpriteCache<{ bytes: number; canvas?: { width: number; height: number; close?: () => void } }>(100);
    const a = { bytes: 80, canvas: { width: 1, height: 1, close: vi.fn() } };
    c.put('a', a);
    c.put('b', { bytes: 80 });
    expect(a.canvas.close).not.toHaveBeenCalled();
    c.sweep();
    expect(a.canvas.close).toHaveBeenCalledTimes(1);
    c.sweep();
    expect(a.canvas.close).toHaveBeenCalledTimes(1);
  });
});
