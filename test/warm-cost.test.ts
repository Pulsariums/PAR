import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { SliceBudget } from '../src/canvas/warm/budget';
import { WarmPlanner, type Builder, type Entry } from '../src/canvas/warm/planner';

import { ev, kit } from './helpers/warmKit';

const script = ev(1000, 1500, '\\blur2', 'A') + ev(1100, 1600, '\\blur3', 'B');
const step = (k: ReturnType<typeof kit>, p: WarmPlanner, b: Builder, budget: number, exempt: boolean) => {
  if (p.isSeek(0)) p.seek(0, k.lines());
  return p.step(0, k.env, 41.7, budget, k.lines(), b, exempt);
};
const rig = (cost: number) => {
  const k = kit(script);
  const taken: Entry[] = [];
  const b: Builder = { take: (e) => { taken.push(e); k.cache.set(e.key, {}); return 'done'; }, cost: () => cost };
  return { k, taken, b, p: new WarmPlanner(k.path) };
};

describe('an entry that would overrun the slice', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('never starts inside a frame, is taken first by a slice between frames, and the rest waits for the next one', () => {
    const { k, taken, b, p } = rig(5);
    const inFrame = step(k, p, b, 1.5, false);
    expect(taken).toHaveLength(0);
    expect(inFrame.more).toBe(true);
    const pump = step(k, p, b, 3, true);
    expect(pump.built).toBe(1);
    expect(pump.more).toBe(true);
    while (step(k, p, b, 3, true).more);
    expect(taken.length).toBe(2);
  });
  it('cheap entries (or a worker: cost 0) are not held back', () => {
    const { k, taken, b, p } = rig(0);
    step(k, p, b, 1.5, false);
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
