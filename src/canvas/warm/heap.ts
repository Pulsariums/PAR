/** Binary min-heap by a numeric priority (ties keep insertion order, so equal first-use times build in file order). */
export class MinHeap<T> {
  private readonly a: Array<{ p: number; n: number; v: T }> = [];
  private seq = 0;

  constructor(private readonly prio: (v: T) => number) {}

  get size(): number { return this.a.length; }

  peek(): T | undefined { return this.a[0]?.v; }

  push(v: T): void {
    const a = this.a;
    a.push({ p: this.prio(v), n: this.seq++, v });
    let i = a.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (!this.less(i, up)) break;
      [a[i], a[up]] = [a[up], a[i]];
      i = up;
    }
  }

  pop(): T | undefined {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0].v;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.less(l, m)) m = l;
        if (r < a.length && this.less(r, m)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }

  clear(): void { this.a.length = 0; this.seq = 0; }

  private less(i: number, j: number): boolean {
    const x = this.a[i], y = this.a[j];
    return x.p < y.p || (x.p === y.p && x.n < y.n);
  }
}
