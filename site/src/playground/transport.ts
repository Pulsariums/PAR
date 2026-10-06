/** Playback abstraction so the UI is identical for the synthetic card and a real video. */
export interface Transport {
  readonly time: number;
  readonly playing: boolean;
  duration: number;
  play(): void;
  pause(): void;
  seek(t: number): void;
  setRate(r: number): void;
}

/** Virtual clock that loops over `duration`. PAR reads `time` through its `clock` option. */
export class CardTransport implements Transport {
  duration = 10;
  /** Loop at the end (default). Off: the clock stops at `duration`. */
  loop = true;
  private base = 0;
  private t0 = performance.now();
  private run = false;
  private rate = 1;

  get playing(): boolean {
    return this.run;
  }

  get time(): number {
    if (!this.run) return this.base;
    const t = this.base + ((performance.now() - this.t0) / 1000) * this.rate;
    if (!(this.duration > 0) || t < this.duration) return t;
    if (this.loop) return t % this.duration;
    this.base = this.duration;
    this.run = false;
    return this.duration;
  }

  play(): void { this.rebase(true); }
  pause(): void { this.rebase(false); }
  seek(t: number): void { this.base = t; this.t0 = performance.now(); }
  setRate(r: number): void { this.base = this.time; this.t0 = performance.now(); this.rate = r; }

  private rebase(run: boolean): void {
    this.base = this.time;
    this.t0 = performance.now();
    this.run = run;
  }
}

export class VideoTransport implements Transport {
  constructor(private readonly v: HTMLVideoElement) {}

  get duration(): number { return Number.isFinite(this.v.duration) ? this.v.duration : 0; }
  set duration(_v: number) { /* video owns its duration */ }
  get time(): number { return this.v.currentTime; }
  get playing(): boolean { return !this.v.paused && !this.v.ended; }
  play(): void { void this.v.play().catch(() => undefined); }
  pause(): void { this.v.pause(); }
  seek(t: number): void { this.v.currentTime = t; }
  setRate(r: number): void { this.v.playbackRate = r; }
}
