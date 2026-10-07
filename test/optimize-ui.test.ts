import { describe, expect, it } from 'vitest';

import { MAX_OPTIMIZE_BYTES, optimizedName } from '../site/src/studio/optimize/ui';

describe('optimize panel helpers', () => {
  it('names the result next to the original', () => {
    expect(optimizedName('op.ass')).toBe('op.optimized.ass');
    expect(optimizedName('Episode 01.ASS')).toBe('Episode 01.optimized.ass');
    expect(optimizedName('notes.txt')).toBe('notes.optimized.ass');
    expect(optimizedName('noext')).toBe('noext.optimized.ass');
  });

  it('refuses scripts too big for the browser', () => {
    expect(MAX_OPTIMIZE_BYTES).toBe(120 * 1024 * 1024);
  });
});
