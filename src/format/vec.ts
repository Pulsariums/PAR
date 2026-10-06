import { fail, LIMITS } from './errors';
import { rescale, type Num } from './num';
import type { StreamReader, StreamWriter } from './streams';

/**
 * Numeric vector coder. A "vector" is every number of one text line in traversal order. Lines with the same
 * structure signature form a history; each line is coded as a delta against one earlier line of that history
 * (`dist` back, first order or constant-velocity second order), chosen by the encoder, replayed by the decoder.
 */
export const KEY_REF = 8;
export const KEY_DELTA = 64;
const RING = 2048;
const MAX_SIGS = 4096;
const POOR_BITS = 7;

interface Entry {
  m: number[];
  d: number[];
  /** First-order delta that produced this entry (velocity for the next line). */
  vel: number[];
}

class Hist {
  private readonly ring: Entry[] = [];
  private head = 0;
  lastD = 1;
  misses = 0;
  cool = 0;
  get count(): number {
    return this.ring.length;
  }
  push(e: Entry): void {
    if (this.ring.length < RING) this.ring.push(e);
    else this.ring[this.head] = e;
    this.head = (this.head + 1) % RING;
  }
  /** `dist` 1 = most recent. */
  at(dist: number): Entry {
    const n = this.ring.length;
    return this.ring[(((this.head - dist) % n) + n) % n];
  }
}

const bitlen = (x: number): number => (x < 0x7fffffff ? 32 - Math.clz32(x < 0 ? -x : x) : 40);

const predict = (base: Entry | null, mode: number, i: number, d: number, cur: Num[], keys: number[]): number => {
  if (base && i < base.m.length) {
    const p = rescale({ m: base.m[i], d: base.d[i] }, d);
    return mode === 1 ? p + rescale({ m: base.vel[i], d: base.d[i] }, d) : p;
  }
  return i >= 2 && keys[i] === keys[i - 2] ? rescale(cur[i - 2], d) : 0;
};

export class VecCoder {
  private readonly hist = new Map<number, Hist>();

  private get(sig: number): Hist {
    let h = this.hist.get(sig);
    if (!h) {
      if (this.hist.size >= MAX_SIGS) this.hist.clear();
      h = new Hist();
      this.hist.set(sig, h);
    }
    return h;
  }

  private static record(h: Hist, cur: Num[], base: Entry | null): void {
    const vel = cur.map((n, i) => (base && i < base.m.length ? n.m - rescale({ m: base.m[i], d: base.d[i] }, n.d) : 0));
    h.push({ m: cur.map((n) => n.m), d: cur.map((n) => n.d), vel });
  }

  encode(sig: number, cur: Num[], keys: number[], sw: StreamWriter): void {
    const h = this.get(sig);
    let base: Entry | null = null;
    let mode = 0;
    if (h.count > 0) {
      const cost = (dist: number, md: number): number => {
        const b = h.at(dist);
        let c = 0;
        for (let i = 0; i < cur.length; i++) c += bitlen(cur[i].m - predict(b, md, i, cur[i].d, cur, keys));
        return c;
      };
      let best = h.lastD <= h.count ? h.lastD : 1;
      let bestMode = 0;
      let bestCost = Infinity;
      const tryDist = (dist: number): void => {
        if (dist < 1 || dist > h.count) return;
        for (let md = 0; md < 2; md++) {
          const c = cost(dist, md);
          if (c < bestCost) {
            bestCost = c;
            best = dist;
            bestMode = md;
          }
        }
      };
      for (const dd of [h.lastD, 1, h.lastD + 1, h.lastD - 1, h.lastD + 2, h.lastD - 2]) tryDist(dd);
      const poor = cur.length * POOR_BITS;
      if (bestCost > cur.length * 4) for (let dd = 1; dd <= Math.min(h.count, h.lastD + 32); dd++) tryDist(dd);
      if (bestCost > poor && h.cool === 0) {
        // Re-acquire the lock anywhere in the history; back off when whole stretches of lines have no predecessor.
        for (let dd = 1; dd <= h.count; dd++) tryDist(dd);
        h.misses = bestCost > poor ? h.misses + 1 : 0;
        if (h.misses >= 8) h.cool = 64;
      } else if (h.cool > 0) h.cool--;
      if (bestCost > cur.length * POOR_BITS) {
        // No usable predecessor (a newly born track): code intra and keep the lock on the old distance.
        sw.w(KEY_REF).uv(0);
      } else {
        base = h.at(best);
        mode = bestMode;
        const z = best - h.lastD;
        sw.w(KEY_REF).uv(1 + (z >= 0 ? z * 2 : -z * 2 - 1) * 2 + mode);
        h.lastD = best;
      }
    }
    for (let i = 0; i < cur.length; i++) sw.w(KEY_DELTA + keys[i]).sv(cur[i].m - predict(base, mode, i, cur[i].d, cur, keys));
    VecCoder.record(h, cur, h.count > 0 && base ? base : null);
  }

  /** `cur[i].d` must already be filled (structure phase); fills `cur[i].m`. */
  decode(sig: number, cur: Num[], keys: number[], sr: StreamReader): void {
    if (cur.length > LIMITS.maxVecLen) fail('LIMIT', 'numeric vector too long');
    const h = this.get(sig);
    let base: Entry | null = null;
    let mode = 0;
    if (h.count > 0) {
      const s = sr.r(KEY_REF).uv();
      if (s > 0) {
        mode = (s - 1) % 2;
        const zz = Math.floor((s - 1) / 2);
        const dist = h.lastD + (zz % 2 === 0 ? zz / 2 : -(zz + 1) / 2);
        if (dist < 1 || dist > h.count) fail('CORRUPT', 'bad history reference');
        base = h.at(dist);
        h.lastD = dist;
      }
    }
    for (let i = 0; i < cur.length; i++) cur[i].m = predict(base, mode, i, cur[i].d, cur, keys) + sr.r(KEY_DELTA + keys[i]).sv();
    VecCoder.record(h, cur, base);
  }
}
