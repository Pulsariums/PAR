import { ByteLru } from '../util/ByteLru';

/** The part of a sprite the cache needs. */
export interface Sized {
  bytes: number;
  /** Frees the bitmap when evicted. */
  canvas?: { width: number; height: number; close?: () => void };
}

/**
 * Sprites by key under a memory cap (LRU by bytes). A failed build is remembered as `null` so it is not retried every frame.
 * Keys are content keys (see `specKey`), so the cache stays valid across seeks; it is cleared when fonts or the raster scale change.
 */
export class SpriteCache<S extends Sized> {
  private readonly lru: ByteLru<string, S | null>;
  hits = 0;
  misses = 0;
  prewarmed = 0;
  /** Evicted ImageBitmaps wait here until `sweep`: one may still be in the list of the frame being drawn, and drawing a closed bitmap throws. */
  private readonly graveyard: Array<{ close: () => void }> = [];

  constructor(capBytes: number) {
    this.lru = new ByteLru<string, S | null>(capBytes, (_k, s) => { if (s?.canvas) this.release(s.canvas); });
  }

  /** Frees an evicted bitmap: a canvas is shrunk to nothing now, an ImageBitmap (built by a worker) is closed at the next `sweep`. */
  private release(c: { width: number; height: number; close?: () => void }): void {
    if (typeof c.close === 'function') this.graveyard.push(c as { close: () => void });
    else { c.width = 0; c.height = 0; }
  }

  /** Closes the bitmaps evicted since the last sweep (call between frames). */
  sweep(): void {
    for (const b of this.graveyard.splice(0)) b.close();
  }

  get bytes(): number { return this.lru.bytes; }
  get size(): number { return this.lru.size; }
  get evictions(): number { return this.lru.evictions; }
  get capBytes(): number { return this.lru.capBytes; }
  set capBytes(n: number) { this.lru.capBytes = n; }

  /** Cached sprite without building (undefined = unknown, null = known unbuildable). Counts as a use, not as a hit/miss. */
  peek(key: string): S | null | undefined { return this.lru.get(key); }

  /** Cached sprite or `build()` (counted as a miss). */
  getOrBuild(key: string, build: () => S | null): S | null {
    const hit = this.lru.get(key);
    if (hit !== undefined) { this.hits++; return hit; }
    this.misses++;
    const s = build();
    this.lru.set(key, s, s ? s.bytes : 16);
    return s;
  }

  /** Stores a sprite built elsewhere (a worker) unless the key is already cached; counts as built ahead. */
  put(key: string, s: S | null): boolean {
    if (this.lru.has(key)) { if (s?.canvas) this.release(s.canvas); return false; }
    this.prewarmed++;
    this.lru.set(key, s, s ? s.bytes : 16);
    return true;
  }

  /** Builds and stores without touching hit/miss counters (lookahead). */
  store(key: string, build: () => S | null, count = true): void {
    if (this.lru.has(key)) return;
    const s = build();
    if (count) this.prewarmed++;
    this.lru.set(key, s, s ? s.bytes : 16);
  }

  clear(): void { this.lru.clear(); }
}
