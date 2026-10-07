import { describe, expect, it } from 'vitest';

import { SliceBudget } from '../src/canvas/warm/budget';
import { WarmPlanner, type Builder, type Entry } from '../src/canvas/warm/planner';

import { ev, kit } from './helpers/warmKit';

const script = ev(1000, 1500, '\\blur2', 'A') + ev(1100, 1600, '\\blur3', 'B');
const rig = (cost: number) => {
  const k = kit(script);
  const taken: Entry[] = [];
  const b: Builder = { take: (e) => { taken.push(e); k.cache.set(e.key, {}); return 'done'; }, cost: () => cost };
  return { k, taken, b, p: new WarmPlanner() };
};

describe('an entry that would overrun the slice', () => {
  it('never starts inside a frame, is taken first by a slice between frames, and the rest waits for the next one', () => {
    const { k, taken, b, p } = rig(5);
    const inFrame = p.step(k.path, 0, k.env, 41.7, 1.5, k.lines(), b, false);
    expect(taken).toHaveLength(0);
    expect(inFrame.more).toBe(true);
    const pump = p.step(k.path, 0, k.env, 41.7, 3, k.lines(), b, true);
    expect(pump.built).toBe(1);
    expect(pump.more).toBe(true);
    while (p.step(k.path, 0, k.env, 41.7, 3, k.lines(), b, true).more);
    expect(taken.length).toBe(2);
  });
  it('cheap entries (or a worker: cost 0) are not held back', () => {
    const { k, taken, b, p } = rig(0);
    p.step(k.path, 0, k.env, 41.7, 1.5, k.lines(), b, false);
    expect(taken.length).toBe(2);
  });
});

describe('slice budget calibrates the cost model to the machine', () => {
  it('trusts the model until something was measured, then follows the measured ratio', () => {
    const b = new SliceBudget();
    expect(b.scaled(2)).toBe(2);
    for (let i = 0; i < 30; i++) b.noteBuilds(4, 40, 8); // 10 ms measured per sprite against 2 ms estimated
    expect(b.scaled(2)).toBeGreaterThan(8);
    expect(b.scaled(2)).toBeLessThanOrEqual(40);
  });
});
