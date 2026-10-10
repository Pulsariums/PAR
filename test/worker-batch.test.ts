import { describe, expect, it, vi } from 'vitest';

import { SpritePool, type PoolHooks } from '../src/canvas/workers/pool';
import type { ToSprite } from '../src/canvas/workers/protocol';
import type { SpriteSpec } from '../src/canvas/types';

import { fakeWorker, hostDeps, spec, wait } from './helpers/fakeWorker';

const hooks = (o: Partial<PoolHooks> = {}): PoolHooks => ({ built: () => undefined, refused: () => undefined, free: () => undefined, failed: () => undefined, ...o });

// A single-plate blurred fill (no stroke/shadow/carve) is what `maskOf` shares a white mask across: only the colour differs per variant.
const tinted = (colour: string): SpriteSpec => ({ ...spec('K'), plates: [{ fill: colour, stroke: null, strokeW: 0, dx: 0, dy: 0, blur: 1, carve: false, shadow: null }] });
const buildJobsTo = (sent: ToSprite[]): number => sent.reduce((n, m) => n + (m.op === 'build' ? m.jobs.length : 0), 0);

describe('sprite worker result batches', () => {
  it('delivers one worker message through one batch hook, preserving result order', async () => {
    const built = vi.fn();
    const builtBatch = vi.fn();
    const pool = new SpritePool(() => fakeWorker(hostDeps()), 1, hooks({ built, builtBatch }));
    await wait();

    for (const key of ['a', 'b', 'c']) {
      expect(pool.submit(key, spec(key))).toBe(true);
    }
    pool.flush();
    for (let i = 0; i < 10 && builtBatch.mock.calls.length === 0; i++) await wait(20);

    expect(built).not.toHaveBeenCalled();
    expect(builtBatch).toHaveBeenCalledTimes(1);
    expect(builtBatch.mock.calls[0][0].map(({ key }: { key: string }) => key)).toEqual(['a', 'b', 'c']);
    expect(pool.pending).toBe(0);
    pool.destroy();
  });

  it('sends colours of one shape to the worker that holds its white mask (ending particle burst)', async () => {
    // Every ending particle shares the mask but differs in colour. Without send-time affinity the burst splits across workers and
    // each rasterises the shape from scratch; with it, one worker builds the mask once and tints the rest.
    const s0: ToSprite[] = [];
    const s1: ToSprite[] = [];
    let n = 0;
    const factory = () => (n++ === 0 ? fakeWorker(hostDeps(), s0) : fakeWorker(hostDeps(), s1));
    const pool = new SpritePool(factory, 2, hooks());
    await wait(); // both workers now `ready`
    const colours = ['rgb(255,0,0)', 'rgb(0,255,0)', 'rgb(0,0,255)', 'rgb(10,20,30)'];
    for (let i = 0; i < colours.length; i++) expect(pool.submit(`k${i}`, tinted(colours[i]))).toBe(true);
    pool.flush(); // first batch claims the mask affinity at send time
    const more = ['rgb(40,50,60)', 'rgb(70,80,90)', 'rgb(100,110,120)'];
    for (let i = 0; i < more.length; i++) expect(pool.submit(`b${i}`, tinted(more[i]))).toBe(true);
    pool.flush(); // delivered before these arrived: they must follow the mask to the SAME worker
    // Ties in load go to the first worker, and the mask affinity (claimed at the first flush) keeps the burst there.
    expect(buildJobsTo(s0)).toBe(7);
    expect(buildJobsTo(s1)).toBe(0);
  });
});