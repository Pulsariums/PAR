/**
 * Binary range coder (carry-less, 32 bit, 12 bit probabilities) and a three-input logistic mixing predictor.
 * The caller supplies three context hashes per symbol and a node id per binary decision.
 */
import { SQUASH, STRETCH } from './rcTables';

const MAX_BITS = 22;
const T0 = new Uint16Array(1 << MAX_BITS);
const T1 = new Uint16Array(1 << MAX_BITS);
const T2 = new Uint16Array(1 << MAX_BITS);
const SETS = 2048;
const W = new Float32Array(SETS * 4);

export const hash = (a: number, b: number): number => Math.imul((a ^ Math.imul(b + 0x7f4a7c15, 0x9e3779b1)) >>> 0, 0x85ebca6b) >>> 0;

export class Predictor {
  private readonly sh: number;
  private c0 = 0;
  private c1 = 0;
  private c2 = 0;
  private wb = 0;
  private wi = 0;
  private i0 = 0;
  private i1 = 0;
  private i2 = 0;
  private s0 = 0;
  private s1 = 0;
  private s2 = 0;
  private pr = 0.5;

  /** Tables are sized from the block size so tiny blocks stay cheap to initialise. */
  constructor(rawLen: number) {
    const bits = Math.min(MAX_BITS, Math.max(12, Math.ceil(Math.log2(rawLen + 1)) + 1));
    this.sh = 32 - bits;
    T0.fill(32768, 0, 1 << bits);
    T1.fill(32768, 0, 1 << bits);
    T2.fill(32768, 0, 1 << bits);
    for (let k = 0; k < W.length; k += 4) {
      W[k] = 0.35;
      W[k + 1] = 0.4;
      W[k + 2] = 0.4;
      W[k + 3] = 0;
    }
  }

  /** `weightKey` picks the mixer weight family (usually the stream key). */
  ctx(c0: number, c1: number, c2: number, weightKey: number): void {
    this.c0 = c0;
    this.c1 = c1;
    this.c2 = c2;
    this.wb = (hash(weightKey, 77) >>> 21) * 8 % SETS;
  }

  /** P(bit = 1) in 1..4095 for decision `node`; `cls` (0..7) selects the mixer weights within the family. */
  p(node: number, cls: number): number {
    const sh = this.sh;
    const wi = (this.wb + cls) * 4;
    this.wi = wi;
    const i0 = Math.imul(this.c0 + node, 0x9e3779b1) >>> sh;
    const i1 = Math.imul(this.c1 + node, 0x9e3779b1) >>> sh;
    const i2 = Math.imul(this.c2 + node, 0x9e3779b1) >>> sh;
    this.i0 = i0;
    this.i1 = i1;
    this.i2 = i2;
    const s0 = STRETCH[T0[i0] >>> 4];
    const s1 = STRETCH[T1[i1] >>> 4];
    const s2 = STRETCH[T2[i2] >>> 4];
    this.s0 = s0;
    this.s1 = s1;
    this.s2 = s2;
    let dot = W[wi + 3] * 0.3 + W[wi] * s0 + W[wi + 1] * s1 + W[wi + 2] * s2;
    dot = dot > 11.99 ? 11.99 : dot < -11.99 ? -11.99 : dot;
    const pr = SQUASH[((dot * 170.667) | 0) + 2048];
    this.pr = pr;
    const p = (pr * 4096) | 0;
    return p < 1 ? 1 : p > 4095 ? 4095 : p;
  }

  update(bit: number): void {
    const err = (bit - this.pr) * 0.02;
    const wi = this.wi;
    W[wi] += err * this.s0;
    W[wi + 1] += err * this.s1;
    W[wi + 2] += err * this.s2;
    W[wi + 3] += err;
    const target = bit ? 65535 : 0;
    T0[this.i0] += (target - T0[this.i0]) >> 5;
    T1[this.i1] += (target - T1[this.i1]) >> 4;
    T2[this.i2] += (target - T2[this.i2]) >> 4;
  }
}

/** Registers stay int32 (unsigned meaning via the sign-flip compare): no heap numbers in the hot loop. */
const FLIP = -2147483648;

export class Encoder {
  private x1 = 0;
  private x2 = -1;
  private buf = new Uint8Array(1024);
  private n = 0;
  private put(b: number): void {
    if (this.n === this.buf.length) {
      const nb = new Uint8Array(this.buf.length * 2);
      nb.set(this.buf);
      this.buf = nb;
    }
    this.buf[this.n++] = b;
  }
  bit(p: number, bit: number): void {
    const xmid = (this.x1 + Math.imul((this.x2 - this.x1) >>> 12, p)) | 0;
    if (bit) this.x2 = xmid;
    else this.x1 = (xmid + 1) | 0;
    while (((this.x1 ^ this.x2) & 0xff000000) === 0) {
      this.put(this.x2 >>> 24);
      this.x1 = this.x1 << 8;
      this.x2 = (this.x2 << 8) | 255;
    }
  }
  finish(): Uint8Array {
    for (let k = 0; k < 4; k++) {
      this.put(this.x1 >>> 24);
      this.x1 = this.x1 << 8;
    }
    return this.buf.subarray(0, this.n);
  }
}

export class Decoder {
  private x1 = 0;
  private x2 = -1;
  private x = 0;
  private pos: number;
  constructor(private readonly buf: Uint8Array, start: number) {
    this.pos = start;
    for (let k = 0; k < 4; k++) this.x = (this.x << 8) | this.next();
  }
  private next(): number {
    return this.pos < this.buf.length ? this.buf[this.pos++] : 0;
  }
  bit(p: number): number {
    const xmid = (this.x1 + Math.imul((this.x2 - this.x1) >>> 12, p)) | 0;
    const y = (this.x ^ FLIP) <= (xmid ^ FLIP) ? 1 : 0;
    if (y) this.x2 = xmid;
    else this.x1 = (xmid + 1) | 0;
    while (((this.x1 ^ this.x2) & 0xff000000) === 0) {
      this.x1 = this.x1 << 8;
      this.x2 = (this.x2 << 8) | 255;
      this.x = (this.x << 8) | this.next();
    }
    return y;
  }
}
