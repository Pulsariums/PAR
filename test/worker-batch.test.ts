import { describe, expect, it, vi } from 'vitest';

import { SpritePool, type PoolHooks } from '../src/canvas/workers/pool';

import { fakeWorker, hostDeps, spec, wait } from './helpers/fakeWorker';

const hooks = (o: Partial<PoolHooks> = {}): PoolHooks => ({ built: () => undefined, refused: () => undefined, free: () => undefined, failed: () => undefined, ...o });

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
});