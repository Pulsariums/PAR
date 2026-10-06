// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { encodeXpar, estimateXpar, indexAss } from '../src/format';
import { profileText, te } from './format-helpers';

vi.setConfig({ testTimeout: 60_000 });

describe('estimateXpar', () => {
  it('lands near the exact size and says it is an estimate', async () => {
    const text = profileText('a-text-24');
    const exact = (await encodeXpar(te.encode(text))).length;
    const ix = await indexAss(new Blob([text]), { rangeBytes: 64 * 1024 });
    const e = await estimateXpar(ix, 4);
    expect(e.isEstimate).toBe(true);
    expect(e.samples).toBeGreaterThan(0);
    expect(e.lowBytes).toBeLessThanOrEqual(e.approxBytes);
    expect(e.highBytes).toBeGreaterThanOrEqual(e.approxBytes);
    // cold model in every sample biases high: allow -30 % .. +80 %
    expect(e.approxBytes).toBeGreaterThan(exact * 0.7);
    expect(e.approxBytes).toBeLessThan(exact * 1.8);
  });
  it('accepts a string / blob directly', async () => {
    const e = await estimateXpar(profileText('c-episode'));
    expect(e.approxBytes).toBeGreaterThan(0);
  });
});
