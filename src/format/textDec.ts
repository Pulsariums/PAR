import type { DictReader } from './dict';
import { fail, LIMITS } from './errors';
import type { Num } from './num';
import type { StreamReader } from './streams';
import { TAG_BY_ID, TAG_T as TAG_T_ID, VERB_ID } from './tagTable';
import { DEC_BASE, DRAW_KEY, K, mix, NEST_KEY } from './textKeys';
import { printText, type Draw, type Seg, type Tag } from './textModel';
import type { VecCoder } from './vec';

interface Shape {
  cmds: number[];
  counts: number[];
}

/** Streams => Text field. Mirror image of `TextEnc`; every read is bounds-checked by the stream reader. */
export class TextDec {
  private readonly shapes: Shape[] = [];
  private nums: Num[] = [];
  private keys: number[] = [];
  private sig = 0;

  constructor(private readonly sr: StreamReader, private readonly dict: DictReader, private readonly vec: VecCoder) {}

  private num(key: number): Num {
    const n: Num = { m: 0, d: this.sr.r(DEC_BASE + key).u8() };
    if (n.d > 15) fail('CORRUPT', 'bad decimal count');
    this.nums.push(n);
    this.keys.push(key);
    return n;
  }

  private draw(trail: boolean): Draw {
    const r = this.sr.r(K.SHP);
    const id = r.uv();
    if (id > this.shapes.length) fail('CORRUPT', 'bad shape id');
    if (id === this.shapes.length) {
      const n = r.uv();
      if (n > LIMITS.maxVecLen) fail('LIMIT', 'drawing too large');
      const sh: Shape = { cmds: [], counts: [] };
      for (let i = 0; i < n; i++) {
        sh.cmds.push(r.u8());
        sh.counts.push(r.uv());
      }
      this.shapes.push(sh);
    }
    this.sig = mix(this.sig, id + 1000);
    const sh = this.shapes[id];
    let i = 0;
    const groups = sh.cmds.map((c, gi) => {
      const nums: Num[] = [];
      for (let k = 0; k < sh.counts[gi]; k++) nums.push(this.num(DRAW_KEY + (i++ % 2)));
      return { cmd: String.fromCharCode(c), nums };
    });
    return { groups, trail };
  }

  private tag(b: number, nest: number): Tag {
    const id = b & 63;
    if (id === VERB_ID) return { k: 'v', raw: this.dict.get(this.sr, K.VERB) };
    const def = TAG_BY_ID[id];
    if (!def) return fail('CORRUPT', 'unknown tag id');
    const cnt = this.sr.r(K.CNT);
    switch (def.kind) {
      case 'num':
        return { k: 'n', id, nums: b & 64 ? [this.num(id * 8 + nest)] : [] };
      case 'par': {
        const n = def.count === 0 ? cnt.uv() : def.count;
        if (def.count === 0) this.sig = mix(this.sig, n);
        if (n > 8) fail('CORRUPT', 'bad argument count');
        return { k: 'n', id, nums: Array.from({ length: n }, (_v, i) => this.num(id * 8 + Math.min(i, 7) + nest)) };
      }
      case 'hex': {
        if (!(b & 64)) return { k: 'h', id, n: { m: 0, d: 0 }, digits: 0 };
        const digits = this.sr.r(K.HEX).u8();
        return { k: 'h', id, n: this.num(id * 8 + nest), digits };
      }
      case 'str':
        return { k: 's', id, s: this.dict.get(this.sr, K.LIT) };
      case 'clip': {
        if (!(b & 128)) {
          return { k: 'n', id, nums: Array.from({ length: 4 }, (_v, i) => this.num(id * 8 + i + nest)) };
        }
        const trail = cnt.uv() === 1;
        const scale = b & 64 ? this.num(id * 8 + nest) : null;
        return { k: 'c', id, scale, draw: this.draw(trail) };
      }
      case 't': {
        const n = cnt.uv();
        if (n > 3) fail('CORRUPT', 'bad argument count');
        const nums = Array.from({ length: n }, (_v, i) => this.num(TAG_T_ID * 8 + i + nest));
        return { k: 't', nums, tags: this.tags(NEST_KEY) };
      }
    }
  }

  /** Reads tags until the 0 terminator. */
  private tags(nest: number): Tag[] {
    const out: Tag[] = [];
    const r = this.sr.r(K.TAG);
    for (;;) {
      const b = r.uv();
      this.sig = mix(this.sig, b);
      if (b === 0) return out;
      if (out.length > LIMITS.maxVecLen) fail('LIMIT', 'too many tags');
      out.push(this.tag(b, nest));
    }
  }

  decode(): string {
    this.nums = [];
    this.keys = [];
    this.sig = 17;
    const segs: Seg[] = [];
    const ops = this.sr.r(K.OPS);
    for (;;) {
      const op = ops.u8();
      if (op === 0) break;
      if (segs.length > LIMITS.maxVecLen) fail('LIMIT', 'too many segments');
      this.sig = mix(this.sig, op === 3 ? 2 : op === 5 ? 4 : op);
      if (op === 1) segs.push({ k: 'lit', s: this.dict.get(this.sr, K.LIT) });
      else if (op === 2 || op === 3) segs.push({ k: 'draw', d: this.draw(op === 3) });
      else if (op === 4 || op === 5) {
        const pre = op === 5 ? this.dict.get(this.sr, K.LIT) : '';
        segs.push({ k: 'blk', pre, tags: this.tags(0) });
      } else fail('CORRUPT', 'bad text op');
    }
    this.vec.decode(this.sig, this.nums, this.keys, this.sr);
    return printText(segs);
  }
}
