import { fail } from './errors';

/** Growable byte buffer with LEB128 varints (arithmetic, so values up to 2^53 are exact). */
export class ByteWriter {
  buf: Uint8Array;
  len = 0;
  constructor(cap = 256) {
    this.buf = new Uint8Array(cap);
  }
  private ensure(n: number): void {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
  }
  u8(v: number): void {
    this.ensure(1);
    this.buf[this.len++] = v;
  }
  /** Unsigned integer in [0, 2^53). */
  uv(v: number): void {
    this.ensure(8);
    while (v >= 128) {
      this.buf[this.len++] = (v % 128) | 128;
      v = Math.floor(v / 128);
    }
    this.buf[this.len++] = v;
  }
  /** Signed integer, zigzag. */
  sv(v: number): void {
    this.uv(v >= 0 ? v * 2 : -v * 2 - 1);
  }
  u32(v: number): void {
    this.ensure(4);
    for (let i = 0; i < 4; i++) this.buf[this.len++] = (v >>> (8 * i)) & 255;
  }
  u64(v: number): void {
    this.u32(v % 4294967296);
    this.u32(Math.floor(v / 4294967296));
  }
  bytes(b: Uint8Array): void {
    this.ensure(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
  }
  /** Length-prefixed UTF-8 string. */
  str(s: string): void {
    const b = ENC.encode(s);
    this.uv(b.length);
    this.bytes(b);
  }
  view(): Uint8Array {
    return this.buf.subarray(0, this.len);
  }
}

const ENC = new TextEncoder();
const DEC = new TextDecoder('utf-8', { fatal: true });
export const utf8 = (s: string): Uint8Array => ENC.encode(s);
export const fromUtf8 = (b: Uint8Array): string => DEC.decode(b);

/** Bounds-checked reader; every overrun is a `TRUNCATED` error, never an out-of-range read. */
export class ByteReader {
  pos = 0;
  constructor(readonly buf: Uint8Array) {}
  get left(): number {
    return this.buf.length - this.pos;
  }
  u8(): number {
    if (this.pos >= this.buf.length) fail('TRUNCATED', 'unexpected end of data');
    return this.buf[this.pos++];
  }
  uv(): number {
    let v = 0;
    let mul = 1;
    for (let i = 0; i < 8; i++) {
      const b = this.u8();
      v += (b & 127) * mul;
      if (b < 128) return v;
      mul *= 128;
    }
    return fail('CORRUPT', 'varint too long');
  }
  sv(): number {
    const z = this.uv();
    return z % 2 === 0 ? z / 2 : -(z + 1) / 2;
  }
  u32(): number {
    if (this.left < 4) fail('TRUNCATED', 'unexpected end of data');
    const b = this.buf;
    const p = this.pos;
    this.pos += 4;
    return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
  }
  u64(): number {
    const lo = this.u32();
    const hi = this.u32();
    if (hi > 0x1fffff) fail('CORRUPT', 'offset out of range');
    return hi * 4294967296 + lo;
  }
  bytes(n: number): Uint8Array {
    if (n < 0 || n > this.left) fail('TRUNCATED', 'unexpected end of data');
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  str(max: number): string {
    const n = this.uv();
    if (n > max) fail('LIMIT', 'string too long');
    try {
      return fromUtf8(this.bytes(n));
    } catch (e) {
      if (e instanceof Error && e.name === 'XparError') throw e;
      return fail('CORRUPT', 'invalid UTF-8 string');
    }
  }
}
