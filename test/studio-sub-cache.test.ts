import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SubtitleSource } from '../src/source';
import type { StudioSession } from '../site/src/studio/session';
import { MAX_RUNTIME_ENTRIES, SUBTITLE_MANIFEST_KEY, SubtitleCache, scheduleSubtitlePrewarm } from '../site/src/studio/subCache';

const source = (_id: string, prefetch = vi.fn()): SubtitleSource => ({
  kind: 'test',
  script: { info: {} as StudioSession['source']['script']['info'], styles: new Map(), warnings: [] },
  duration: 20,
  eventCount: 4,
  readWindow: async () => [],
  prefetch,
  close: vi.fn(),
});

const session = (name: string, s = source(name)): StudioSession => ({ name, blob: new File(['subtitle'], name, { lastModified: 1 }), kind: 'ass', source: s, openMs: 1, header: null });

afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
});

describe('Studio subtitle identity cache', () => {
  it('keeps runtime entries bounded and persists only compact metadata', () => {
    const cache = new SubtitleCache();
    for (let i = 0; i < MAX_RUNTIME_ENTRIES + 1; i++) {
      const s = session(`s${i}.ass`);
      cache.set(cache.identity(s.blob as File, 'ass'), s);
    }
    expect(cache['runtime'].size).toBe(MAX_RUNTIME_ENTRIES);
    const raw = sessionStorage.getItem(SUBTITLE_MANIFEST_KEY)!;
    expect(raw).not.toContain('subtitle');
    expect(raw).toContain('s3.ass');
    expect(raw).not.toContain('readWindow');
  });

  it('survives unavailable sessionStorage without affecting the runtime cache', () => {
    const get = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const cache = new SubtitleCache();
    const s = session('safe.ass');
    const identity = cache.identity(s.blob as File, 'ass');
    cache.set(identity, s);
    expect(cache.get(identity)).toBe(s);
    get.mockRestore();
  });
});

describe('Studio subtitle idle prewarm', () => {
  it('prefetches a small forward range only when idle and can cancel stale work', () => {
    vi.useFakeTimers();
    const prefetch = vi.fn();
    let now = 5;
    scheduleSubtitlePrewarm(source('idle', prefetch), () => now);
    expect(prefetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(249);
    expect(prefetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(prefetch).toHaveBeenCalledWith(5, 7);

    const stale = scheduleSubtitlePrewarm(source('stale', prefetch), () => now);
    stale.cancel();
    vi.advanceTimersByTime(500);
    expect(prefetch).toHaveBeenCalledTimes(1);
  });
});
