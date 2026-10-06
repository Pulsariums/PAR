import { ByteLru } from '../util/ByteLru';

/** The part of a sprite the cache needs. */
export interface Sized {
  bytes: number;
  /** Frees the bitmap when evicted. */
  canvas?: { width: number; height: number };
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

  constructor(capBytes: number) {
    this.lru = new ByteLru<string, S | null>(capBytes, (_k, s) => { if (s?.canvas) { s.canvas.width = 0; s.canvas.height = 0; } });
  }

  get bytes(): number { return this.lru.bytes; }
  get size(): number { return this.lru.size; }
  get evictions(): number { return this.lru.evictions; }
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

  /** Builds and stores without touching hit/miss counters (lookahead). */
  store(key: string, build: () => S | null, count = true): void {
    if (this.lru.has(key)) return;
    const s = build();
    if (count) this.prewarmed++;
    this.lru.set(key, s, s ? s.bytes : 16);
  }

  clear(): void { this.lru.clear(); }
}
