/** Outstanding async work (font parsing, loading, fetching) with an `idle()` that waits for all of it. */
export class WorkSet {
  private readonly pending = new Set<Promise<unknown>>();

  constructor(private readonly onSettle: () => void) {}

  track<T>(p: Promise<T>): Promise<T> {
    const done = p.finally(() => { this.pending.delete(done); this.onSettle(); });
    this.pending.add(done);
    return done;
  }

  /** Resolves when nothing is outstanding (work started while waiting is awaited too). */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }
}
