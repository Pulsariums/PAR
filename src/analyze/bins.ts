/** Growable numeric series indexed by a non-negative integer (a frame or a second): sparse writes, no spread of huge arrays. */
export class Series {
  private a: Float64Array;
  private n = 0;

  constructor(cap = 1024) { this.a = new Float64Array(cap); }

  get length(): number { return this.n; }

  add(i: number, v: number): void {
    if (i < 0 || !Number.isFinite(i)) return;
    if (i >= this.a.length) {
      const b = new Float64Array(Math.max(i + 1, this.a.length * 2));
      b.set(this.a);
      this.a = b;
    }
    this.a[i] += v;
    if (i >= this.n) this.n = i + 1;
  }

  get(i: number): number { return i >= 0 && i < this.n ? this.a[i] : 0; }

  /** Largest value (loop, never `Math.max(...a)`: a 100 MB script has hundreds of thousands of entries). */
  max(from = 0, to = this.n): { v: number; at: number } {
    let v = 0, at = from;
    for (let i = Math.max(0, from); i < Math.min(to, this.n); i++) if (this.a[i] > v) { v = this.a[i]; at = i; }
    return { v, at };
  }

  sum(from: number, to: number): number {
    let s = 0;
    for (let i = Math.max(0, from); i < Math.min(to, this.n); i++) s += this.a[i];
    return s;
  }

  /** Running sum of a difference series (`+1` at a start frame, `-1` at its end) = lines visible per frame. */
  running(): Series {
    const out = new Series(Math.max(16, this.n));
    let acc = 0;
    for (let i = 0; i < this.n; i++) { acc += this.a[i]; out.add(i, acc); }
    return out;
  }
}
