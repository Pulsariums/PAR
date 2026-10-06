import { describe, expect, it } from 'vitest';

import { SpriteCache } from '../src/canvas/SpriteCache';
import { ByteLru } from '../src/util/ByteLru';

const sprite = (bytes: number) => ({ bytes, canvas: { width: 10, height: 10 } });

describe('ByteLru', () => {
  it('evicts least recently used entries past the byte cap, keeping the newest', () => {
    const gone: string[] = [];
    const c = new ByteLru<string, number>(100, (k) => gone.push(k));
    c.set('a', 1, 40);
    c.set('b', 2, 40);
    c.get('a'); // a is now newer than b
    c.set('c', 3, 40);
    expect(gone).toEqual(['b']);
    expect([c.has('a'), c.has('b'), c.has('c')]).toEqual([true, false, true]);
    expect(c.bytes).toBe(80);
    c.set('huge', 4, 500); // larger than the cap: the newest entry still stays
    expect(c.size).toBe(1);
    expect(c.has('huge')).toBe(true);
    expect(c.evictions).toBe(3);
  });

  it('replacing a key re-counts its bytes', () => {
    const c = new ByteLru<string, number>(100);
    c.set('a', 1, 60);
    c.set('a', 2, 10);
    expect(c.bytes).toBe(10);
    expect(c.get('a')).toBe(2);
    c.clear();
    expect([c.bytes, c.size]).toEqual([0, 0]);
  });
});

describe('SpriteCache', () => {
  it('counts hits and misses, builds once per key and never exceeds its memory cap', () => {
    const cache = new SpriteCache<ReturnType<typeof sprite>>(1000);
    let builds = 0;
    const get = (k: string) => cache.getOrBuild(k, () => { builds++; return sprite(300); });
    get('a'); get('a'); get('b'); get('c'); get('d'); // 4 x 300 > 1000: 'a' is evicted
    expect(builds).toBe(4);
    expect([cache.hits, cache.misses]).toEqual([1, 4]);
    expect(cache.bytes).toBeLessThanOrEqual(1000);
    expect(cache.evictions).toBe(1);
    get('a');
    expect(builds).toBe(5);
    expect(cache.bytes).toBeLessThanOrEqual(1000);
  });

  it('frees the bitmap of an evicted sprite and remembers a failed build (no retry every frame)', () => {
    const cache = new SpriteCache<ReturnType<typeof sprite>>(500);
    const first = sprite(400);
    cache.getOrBuild('a', () => first);
    cache.getOrBuild('b', () => sprite(400));
    expect(first.canvas.width).toBe(0);
    let tries = 0;
    expect(cache.getOrBuild('bad', () => { tries++; return null; })).toBeNull();
    expect(cache.getOrBuild('bad', () => { tries++; return null; })).toBeNull();
    expect(tries).toBe(1);
  });

  it('lookahead builds (store) do not count as draw-time misses; clear drops everything (fonts changed)', () => {
    const cache = new SpriteCache<ReturnType<typeof sprite>>(1000);
    cache.store('x', () => sprite(10));
    expect(cache.peek('x')).toBeDefined();
    expect([cache.hits, cache.misses, cache.prewarmed]).toEqual([0, 0, 1]);
    cache.store('x', () => { throw new Error('built twice'); });
    cache.clear();
    expect(cache.peek('x')).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});
