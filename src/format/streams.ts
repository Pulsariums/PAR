import { ByteReader, ByteWriter } from './bytes';
import { fail, LIMITS } from './errors';

/** A set of independent byte streams (one per column/slot), serialized together as one block. */
export class StreamWriter {
  private readonly map = new Map<number, ByteWriter>();
  w(key: number): ByteWriter {
    let s = this.map.get(key);
    if (!s) {
      s = new ByteWriter(64);
      this.map.set(key, s);
    }
    return s;
  }
  /** Raw payload size so far (builders use it to decide when to close a chunk). */
  size(): number {
    let n = 0;
    for (const s of this.map.values()) n += s.len;
    return n;
  }
  /** Per-stream byte counts (diagnostics and benchmarks). */
  sizes(): Map<number, number> {
    return new Map([...this.map].map(([k, w]) => [k, w.len]));
  }
  /** Bytes of one stream (diagnostics). */
  bytesOf(key: number): Uint8Array {
    return this.map.get(key)?.view() ?? new Uint8Array(0);
  }
  /** `uv(count) { uv(key) uv(len) }* bodies...` */
  serialize(): Uint8Array {
    const head = new ByteWriter(16 + this.map.size * 6);
    head.uv(this.map.size);
    let total = 0;
    for (const [key, s] of this.map) {
      head.uv(key);
      head.uv(s.len);
      total += s.len;
    }
    const out = new Uint8Array(head.len + total);
    out.set(head.view());
    let p = head.len;
    for (const s of this.map.values()) {
      out.set(s.view(), p);
      p += s.len;
    }
    return out;
  }
}

export class StreamReader {
  private readonly map = new Map<number, ByteReader>();
  constructor(buf: Uint8Array) {
    const r = new ByteReader(buf);
    const n = r.uv();
    if (n > LIMITS.maxStreams) fail('LIMIT', 'too many streams in a block');
    const table: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) table.push([r.uv(), r.uv()]);
    for (const [key, len] of table) this.map.set(key, new ByteReader(r.bytes(len)));
  }
  /** Missing stream = empty stream (reads fail with TRUNCATED, never out of bounds). */
  r(key: number): ByteReader {
    return this.map.get(key) ?? EMPTY;
  }
}
const EMPTY = new ByteReader(new Uint8Array(0));
