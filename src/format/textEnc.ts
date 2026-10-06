import type { DictWriter } from './dict';
import type { Num } from './num';
import type { StreamWriter } from './streams';
import { TAG_BY_ID, TAG_T as TAG_T_ID, VERB_ID } from './tagTable';
import { DEC_BASE, DRAW_KEY, K, mix, NEST_KEY } from './textKeys';
import { parseTextModel, type Draw, type Seg, type Tag } from './textModel';
import type { VecCoder } from './vec';

/** Text field => streams. Owns the chunk-local shape table and numeric histories. */
export class TextEnc {
  private readonly shapes = new Map<string, number>();
  private nums: Num[] = [];
  private keys: number[] = [];
  private sig = 0;

  constructor(private readonly sw: StreamWriter, private readonly dict: DictWriter, private readonly vec: VecCoder) {}

  private num(n: Num, key: number): void {
    this.sw.w(DEC_BASE + key).u8(n.d);
    this.nums.push(n);
    this.keys.push(key);
  }

  private mixIn(v: number): void {
    this.sig = mix(this.sig, v);
  }

  private shape(d: Draw): void {
    const key = d.groups.map((g) => `${g.cmd}${g.nums.length},`).join('');
    let id = this.shapes.get(key);
    const w = this.sw.w(K.SHP);
    const isNew = id === undefined;
    if (id === undefined) {
      id = this.shapes.size;
      this.shapes.set(key, id);
    }
    w.uv(id);
    if (isNew) {
      w.uv(d.groups.length);
      for (const g of d.groups) {
        w.u8(g.cmd.charCodeAt(0));
        w.uv(g.nums.length);
      }
    }
    this.mixIn(id + 1000);
    let i = 0;
    for (const g of d.groups) for (const n of g.nums) this.num(n, DRAW_KEY + (i++ % 2));
  }

  private tag(t: Tag, nest: number): void {
    const tw = this.sw.w(K.TAG);
    const emit = (b: number): void => {
      tw.uv(b);
      this.mixIn(b);
    };
    switch (t.k) {
      case 'v':
        emit(VERB_ID);
        this.dict.put(this.sw, K.VERB, t.raw);
        return;
      case 'n': {
        const def = TAG_BY_ID[t.id]!;
        emit(t.id | (def.kind === 'num' && t.nums.length ? 64 : 0));
        if (def.count === 0 && def.kind === 'par') {
          this.sw.w(K.CNT).uv(t.nums.length);
          this.mixIn(t.nums.length);
        }
        t.nums.forEach((n, i) => this.num(n, t.id * 8 + Math.min(i, 7) + nest));
        return;
      }
      case 'h':
        emit(t.id | (t.digits ? 64 : 0));
        if (t.digits) {
          this.sw.w(K.HEX).u8(t.digits);
          this.num(t.n, t.id * 8 + nest);
        }
        return;
      case 's':
        emit(t.id);
        this.dict.put(this.sw, K.LIT, t.s);
        return;
      case 'c':
        emit(t.id | (t.scale ? 64 : 0) | 128);
        if (t.scale) this.num(t.scale, t.id * 8 + nest);
        this.sw.w(K.CNT).uv(t.draw.trail ? 1 : 0);
        this.shape(t.draw);
        return;
      case 't':
        emit(TAG_T_ID);
        this.sw.w(K.CNT).uv(t.nums.length);
        t.nums.forEach((n, i) => this.num(n, TAG_T_ID * 8 + Math.min(i, 7) + nest));
        for (const nt of t.tags) this.tag(nt, NEST_KEY);
        emit(0);
    }
  }

  private seg(g: Seg): void {
    const ops = this.sw.w(K.OPS);
    switch (g.k) {
      case 'lit':
        ops.u8(1);
        this.mixIn(1);
        this.dict.put(this.sw, K.LIT, g.s);
        return;
      case 'draw':
        ops.u8(g.d.trail ? 3 : 2);
        this.mixIn(2);
        this.shape(g.d);
        return;
      case 'blk':
        ops.u8(g.pre ? 5 : 4);
        this.mixIn(4);
        if (g.pre) this.dict.put(this.sw, K.LIT, g.pre);
        for (const t of g.tags) this.tag(t, 0);
        this.sw.w(K.TAG).uv(0);
        this.mixIn(0);
    }
  }

  /** Encodes one Text field (the empty text is just an END op). */
  encode(text: string): void {
    this.nums = [];
    this.keys = [];
    this.sig = 17;
    for (const g of parseTextModel(text)) this.seg(g);
    this.sw.w(K.OPS).u8(0);
    this.vec.encode(this.sig, this.nums, this.keys, this.sw);
  }
}
