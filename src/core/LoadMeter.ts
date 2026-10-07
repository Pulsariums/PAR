/**
 * How late display frames are while the loop runs: a rAF probe of its own (the render loop may be driven by video frame callbacks,
 * whose spacing says nothing about main-thread load). `late()` is the share of the last frames that came more than 1.5 display
 * frames after the previous one. The display frame is the fast end of what was seen (10th percentile), so a machine that is
 * always slow does not hide itself by turning its slow rate into the baseline.
 */
export class LoadMeter {
  private readonly buf: number[] = [];
  private pos = 0;
  private last = 0;
  private id = 0;
  private running = false;

  constructor(private readonly recent = 30, private readonly size = 240) {}

  start(): void {
    if (this.running || typeof requestAnimationFrame !== 'function') return;
    this.running = true;
    this.last = 0;
    this.id = requestAnimationFrame((t) => this.tick(t));
  }

  stop(): void {
    this.running = false;
    if (this.id && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.id);
    this.id = 0;
    this.buf.length = 0;
    this.pos = 0;
  }

  private tick(now: number): void {
    this.id = 0;
    if (!this.running) return;
    if (this.last > 0) this.add(now - this.last);
    this.last = now;
    this.id = requestAnimationFrame((t) => this.tick(t));
  }

  /** Records one frame interval (ms). Gaps over 250 ms (hidden tab, breakpoint) are not load and are ignored. */
  add(ms: number): void {
    if (!(ms > 0) || ms > 250) return;
    if (this.buf.length < this.size) this.buf.push(ms);
    else this.buf[this.pos] = ms;
    this.pos = (this.pos + 1) % this.size;
  }

  /** Display frame length: the 10th percentile of the intervals seen (0 until there are enough). */
  get frame(): number {
    if (this.buf.length < 30) return 0;
    const a = this.buf.slice().sort((x, y) => x - y);
    return Math.max(4, a[Math.floor(a.length * 0.1)]);
  }

  /** Share (0..1) of the most recent frames that were late; 0 until the baseline is known. */
  late(): number {
    const base = this.frame;
    if (base === 0) return 0;
    const n = Math.min(this.recent, this.buf.length);
    let c = 0;
    for (let i = 1; i <= n; i++) {
      const v = this.buf[(this.pos - i + this.buf.length * 2) % this.buf.length];
      if (v > base * 1.5 + 2) c++;
    }
    return c / n;
  }
}
