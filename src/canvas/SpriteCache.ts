import { ByteLru } from '../util/ByteLru';

/** The part of a sprite the cache needs. */
export interface Sized {
  bytes: number;
  /** Frees the bitmap when evicted. */
  canvas?: { width: number; height: number; close?: () => void };
}

interface Held<S> { s: S | null; bytes: number }

/**
 * Sprites by key under a memory cap. Two kinds of residents: ordinary ones (LRU by bytes) and PINNED ones, which the warm plan
 * has promised to a frame still to come: a pinned sprite is never evicted, whatever else is built, until it is unpinned (the plan
 * releases it when the last frame that may draw it has passed). The LRU gets whatever the cap leaves after the pins; the plan keeps
 * pins within a share of the cap, so the room for recently used sprites never shrinks to nothing.
 * A failed build is remembered as `null` so it is not retried every frame. Keys are content keys (see `specKey`), so the cache stays
 * valid across seeks; it is cleared when fonts or the raster scale change.
 */
export class SpriteCache<S extends Sized> {
  private readonly lru: ByteLru<string, S | null>;
  private readonly pinned = new Map<string, Held<S>>();
  private pinBytes = 0;
  private cap: number;
  /** Frame-time lookups: found (`hits`) or absent (`misses`: the frame needed a sprite that was not ready). */
  hits = 0;
  misses = 0;
  prewarmed = 0;
  /** Evicted ImageBitmaps wait here until `sweep`: one may still be in the list of the frame being drawn, and drawing a closed bitmap throws. */
  private readonly graveyard: Array<{ close: () => void }> = [];

  constructor(capBytes: number) {
    this.cap = capBytes;
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

  get bytes(): number { return this.lru.bytes + this.pinBytes; }
  get pinnedBytes(): number { return this.pinBytes; }
  get size(): number { return this.lru.size + this.pinned.size; }
  get evictions(): number { return this.lru.evictions; }
  get capBytes(): number { return this.cap; }
  set capBytes(n: number) { this.cap = n; this.fit(); }

  private fit(): void {
    this.lru.capBytes = Math.max(0, this.cap - this.pinBytes);
    this.lru.trim();
  }

  /** Cached sprite without building (undefined = unknown, null = known unbuildable). Counts as a use, not as a hit/miss. */
  peek(key: string): S | null | undefined {
    const p = this.pinned.get(key);
    return p ? p.s : this.lru.get(key);
  }

  has(key: string): boolean { return this.pinned.has(key) || this.lru.has(key); }

  /** A frame asks for a sprite: counted as a hit, or as a miss when it is not there. */
  lookup(key: string): S | null | undefined {
    const s = this.peek(key);
    if (s === undefined) this.misses++; else this.hits++;
    return s;
  }

  /** Cached sprite or `build()` (counted as a miss). */
  getOrBuild(key: string, build: () => S | null): S | null {
    const hit = this.peek(key);
    if (hit !== undefined) { this.hits++; return hit; }
    this.misses++;
    const s = build();
    this.lru.set(key, s, s ? s.bytes : 16);
    return s;
  }

  /** Stores a sprite built elsewhere (a worker) unless the key is already cached; counts as built ahead. `pin`: promised to a later frame. */
  put(key: string, s: S | null, pin = false): boolean {
    if (this.has(key)) { if (s?.canvas) this.release(s.canvas); if (pin) this.pin(key); return false; }
    this.prewarmed++;
    this.add(key, s, pin);
    return true;
  }

  /** Builds and stores without touching hit/miss counters (main-thread build ahead of the frame). */
  store(key: string, build: () => S | null, count = true, pin = false): void {
    if (this.has(key)) { if (pin) this.pin(key); return; }
    const s = build();
    if (count) this.prewarmed++;
    this.add(key, s, pin);
  }

  private add(key: string, s: S | null, pin: boolean): void {
    const bytes = s ? s.bytes : 16;
    if (!pin) { this.lru.set(key, s, bytes); return; }
    this.reservePin(bytes);
    this.pinned.set(key, { s, bytes });
    this.pinBytes += bytes;
    this.fit();
  }

  /** Keeps the sprite resident until `unpin`. False when it is not cached. */
  pin(key: string): boolean {
    if (this.pinned.has(key)) return true;
    const s = this.lru.get(key);
    if (s === undefined) return false;
    const bytes = s ? s.bytes : 16;
    this.lru.delete(key);
    this.reservePin(bytes);
    this.pinned.set(key, { s, bytes });
    this.pinBytes += bytes;
    this.fit();
    return true;
  }

  /**
   * Pins are a promise, not extra memory: the whole cache (pinned + LRU) must respect `cap`, or the `spriteBytes` gauge runs far past
   * it (a dense blur burst over-commits the plan's share). Before a pin that would push the pinned total past the cap, the earliest
   * promise (first pinned, so its `until` passes first) is demoted back to the LRU — the bitmap stays cached and usable, it just
   * becomes evictable again. Only reached when the plan overcommits; the normal share keeps pins well below the cap so nothing moves.
   */
  private reservePin(bytes: number): void {
    if (this.pinBytes + bytes <= this.cap) return;
    const demoted: Array<{ key: string; held: Held<S> }> = [];
    while (this.pinBytes + bytes > this.cap && this.pinned.size > 0) {
      const k = this.pinned.keys().next().value as string;
      const p = this.pinned.get(k)!;
      this.pinned.delete(k);
      this.pinBytes -= p.bytes;
      demoted.push({ key: k, held: p });
    }
    // The room freed by the demotions, made on the LRU before the demoted bitmaps go in, so the loop cannot evict what it just demoted.
    this.lru.capBytes = Math.max(0, this.cap - this.pinBytes);
    for (const { key, held } of demoted) this.lru.set(key, held.s, held.bytes);
  }

  /** The promise is kept: the sprite is an ordinary (most recently used) resident again. */
  unpin(key: string): void {
    const p = this.pinned.get(key);
    if (!p) return;
    this.pinned.delete(key);
    this.pinBytes -= p.bytes;
    this.lru.capBytes = Math.max(0, this.cap - this.pinBytes);
    this.lru.set(key, p.s, p.bytes);
  }

  clear(): void {
    for (const p of this.pinned.values()) if (p.s?.canvas) this.release(p.s.canvas);
    this.pinned.clear();
    this.pinBytes = 0;
    this.lru.capBytes = this.cap;
    this.lru.clear();
  }
}
