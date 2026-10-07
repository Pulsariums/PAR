import { describe, expect, it } from 'vitest';

import { BlankClock, blankDuration } from '../site/src/watch/blank';

describe('blank video', () => {
  it('lasts as long as the subtitle, 10 s without one', () => {
    expect(blankDuration(null)).toBe(10);
    expect(blankDuration(0)).toBe(10);
    expect(blankDuration(NaN)).toBe(10);
    expect(blankDuration(93.5)).toBe(93.5);
  });
  it('clock seeks within its length and stops at the end', () => {
    const c = new BlankClock();
    c.duration = 5;
    expect(c.paused).toBe(true);
    c.currentTime = 99;
    expect(c.currentTime).toBe(5);
    c.currentTime = -3;
    expect(c.currentTime).toBe(0);
    const seen: string[] = [];
    ['play', 'pause', 'ended'].forEach((e) => c.addEventListener(e, () => seen.push(e)));
    c.play();
    expect(c.paused).toBe(false);
    c.pause();
    expect(seen).toEqual(['play', 'pause']);
  });
});
