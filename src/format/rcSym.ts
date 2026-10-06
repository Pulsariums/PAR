import { Predictor, hash, type Decoder, type Encoder } from './rcCore';

/**
 * Symbol layer on top of the predictor. Two views of a stream:
 *  - numbers (canonical LEB128 values): zero flag, unary bit-length, then mantissa bits; contexts use the key and the
 *    magnitude class / exact value of the previous values of the same stream;
 *  - bytes (strings): 8 binary decisions per byte, order-0/1/2 contexts.
 */
export class SymbolCoder {
  readonly pr: Predictor;
  private key = 0;
  private p1 = 0;
  private p2 = 0;
  private p3 = 0;
  private x1 = 0;
  constructor(rawLen: number, private readonly enc: Encoder | null, private readonly dec: Decoder | null) {
    this.pr = new Predictor(rawLen);
  }

  /** Start of a stream. */
  begin(key: number): void {
    this.key = key;
    this.p1 = this.p2 = this.p3 = this.x1 = 0;
  }

  private bit(node: number, cls: number, bit: number): number {
    const p = this.pr.p(node, cls);
    if (this.enc) this.enc.bit(p, bit);
    else bit = this.dec!.bit(p);
    this.pr.update(bit);
    return bit;
  }

  private setCtx(): void {
    const k = this.key;
    this.pr.ctx(hash(k, this.p1), hash(k + 1000003, this.x1), hash(hash(k + 2000003, this.p1), this.p2 * 64 + this.p3), k);
  }

  /** Codes one non-negative integer (< 2^53); with a decoder `v` is ignored and the decoded value returned. */
  num(v: number): number {
    this.setCtx();
    const enc = this.enc !== null;
    const zero = this.bit(0, 0, enc && v === 0 ? 1 : 0);
    let out = 0;
    let nb = 0;
    if (!zero) {
      const want = enc ? bitlen(v) : 0;
      nb = 1;
      while (nb < 53 && this.bit(nb, nb < 4 ? nb : 4, enc && want > nb ? 1 : 0)) nb++;
      out = 1;
      let prefix = 1;
      for (let i = nb - 2; i >= 0; i--) {
        const k = nb - 2 - i;
        const b = enc ? Math.floor(v / 2 ** i) % 2 : 0;
        const bit = k < 3 ? this.bit(64 + nb * 16 + prefix, 5 + k, b) : this.bit(2048 + nb * 64 + k, 7, b);
        out = out * 2 + bit;
        if (k < 3) prefix = prefix * 2 + bit;
      }
    }
    const val = enc ? v : out;
    this.p3 = this.p2;
    this.p2 = this.p1;
    this.p1 = zero ? 0 : nb;
    this.x1 = val < 65536 ? val : 65536 + (val % 65521);
    return val;
  }

  /** Codes one byte (string streams). */
  byte(c: number): number {
    const k = this.key;
    this.pr.ctx(hash(k, 0x51ed27), hash(hash(k, 0x51ed27), this.p1 + 256), hash(hash(k, this.p1 + 256), this.p2 + 65536), k);
    const enc = this.enc !== null;
    let node = 1;
    for (let bp = 0; bp < 8; bp++) node = node * 2 + this.bit(node, bp, enc ? (c >> (7 - bp)) & 1 : 0);
    const out = node & 255;
    this.p2 = this.p1;
    this.p1 = out;
    return out;
  }

  /** Equiprobable flag (stream mode). */
  flag(v: number): number {
    const p = 2048;
    if (this.enc) {
      this.enc.bit(p, v);
      return v;
    }
    return this.dec!.bit(p);
  }
}

const bitlen = (v: number): number => (v < 2 ** 31 ? 32 - Math.clz32(v) : 32 + (32 - Math.clz32(Math.floor(v / 2 ** 32))));
