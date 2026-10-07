/**
 * LRU map with a memory cap: every entry carries an estimated byte size, the least recently used entries are dropped
 * while the total exceeds `capBytes` (the newest entry always stays, even when it alone is larger than the cap).
 */
export class ByteLru<K, V> {
  private readonly map = new Map<K, { v: V; bytes: number }>();
  private total = 0;
  evictions = 0;

  constructor(public capBytes: number, private readonly onEvict?: (key: K, value: V) => void) {}

  get bytes(): number { return this.total; }
  get size(): number { return this.map.size; }
  has(key: K): boolean { return this.map.has(key); }

  /** Value (marked most recently used) or undefined. */
  get(key: K): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    this.map.delete(key);
    this.map.set(key, e);
    return e.v;
  }

  set(key: K, v: V, bytes: number): void {
    this.delete(key);
    this.map.set(key, { v, bytes });
    this.total += bytes;
    this.trim();
  }

  delete(key: K): boolean {
    const e = this.map.get(key);
    if (!e) return false;
    this.map.delete(key);
    this.total -= e.bytes;
    return true;
  }

  clear(): void {
    if (this.onEvict) for (const [k, e] of this.map) this.onEvict(k, e.v);
    this.map.clear();
    this.total = 0;
  }

  /** Drops least recently used entries until the total fits `capBytes` (call after lowering the cap). */
  trim(): void {
    while (this.total > this.capBytes && this.map.size > 1) {
      const [k, e] = this.map.entries().next().value as [K, { v: V; bytes: number }];
      this.map.delete(k);
      this.total -= e.bytes;
      this.evictions++;
      this.onEvict?.(k, e.v);
    }
  }
}
