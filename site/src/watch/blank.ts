import { CardTransport } from '../player/transport';

/** What the play bar needs from its picture: an HTMLVideoElement or the blank clock. */
export interface VideoLike extends EventTarget {
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  volume: number;
  muted: boolean;
  playbackRate: number;
  play(): Promise<void> | void;
  pause(): void;
}

/** Length of the blank picture: the end of the subtitle's last event, 10 s while there is no subtitle (or an empty one). */
export const blankDuration = (subtitleEnd: number | null): number =>
  subtitleEnd !== null && Number.isFinite(subtitleEnd) && subtitleEnd > 0 ? subtitleEnd : 10;

/** A black picture with a clock (CardTransport, no loop) in the shape of a video element. Volume is stored and ignored. */
export class BlankClock extends EventTarget implements VideoLike {
  volume = 1;
  muted = false;
  private readonly t = new CardTransport();
  private rate = 1;
  private wasPaused = true;

  constructor() { super(); this.t.loop = false; this.t.duration = blankDuration(null); }

  get duration(): number { return this.t.duration; }
  set duration(d: number) { this.t.duration = d; }
  get paused(): boolean { return !this.t.playing; }
  get currentTime(): number { return Math.min(this.t.time, this.t.duration); }
  set currentTime(v: number) { this.t.seek(Math.min(Math.max(0, v), this.t.duration)); this.emit('timeupdate'); }
  get playbackRate(): number { return this.rate; }
  set playbackRate(r: number) { this.rate = r; this.t.setRate(r); }

  play(): void {
    if (this.t.time >= this.t.duration) this.t.seek(0);
    this.t.play();
    this.sync();
  }

  pause(): void { this.t.pause(); this.sync(); }

  /** Polled by the play bar every frame: the clock stops by itself at the end. */
  tick(): void { this.sync(); }

  private sync(): void {
    const p = this.paused;
    if (p === this.wasPaused) return;
    this.wasPaused = p;
    const atEnd = p && this.t.time >= this.t.duration;
    this.emit(p ? (atEnd ? 'ended' : 'pause') : 'play');
  }

  private emit(type: string): void { this.dispatchEvent(new Event(type)); }
}
