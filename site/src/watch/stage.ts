import { create, type PARRenderer } from '../../../src/index';
import { BlankClock, blankDuration, type VideoLike } from './blank';
import { openSession } from '../studio/openSession';
import type { StudioSession } from '../studio/session';

/** Small devices get a smaller sprite cache (the default 96 MB is for desktops). */
const cacheMB = (): number => {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return mem && mem <= 4 ? 48 : 96;
};

/** The PAR instance over one video element: the video decides the clock, the subtitle is a windowed source (ASS, XPAR or PAR) opened in a Worker. */
export class WatchStage {
  readonly par: PARRenderer;
  private url: string | null = null;
  private abort: AbortController | null = null;
  session: StudioSession | null = null;
  /** Black picture with the subtitle's own clock; shown while no video file is chosen. */
  readonly clock = new BlankClock();
  blank = false;
  /** What the play bar drives: the video element or the blank clock. */
  media: VideoLike;

  constructor(readonly box: HTMLElement, readonly video: HTMLVideoElement) {
    this.media = video;
    this.par = create({ container: box, video, zIndex: 1, spriteCacheMB: cacheMB() });
  }

  get hasVideo(): boolean { return this.url !== null; }
  /** A picture to play: a video file or the blank one. */
  get ready(): boolean { return this.url !== null || this.blank; }

  /** Black picture, as long as the subtitle (10 s without one). Any video is dropped; the subtitle stays. */
  setBlank(): void {
    this.dropVideo();
    this.blank = true;
    this.clock.pause();
    this.clock.currentTime = 0;
    this.fitBlank();
    this.media = this.clock;
    this.par.setOptions({ video: null, clock: () => this.clock.currentTime, region: 'container' });
  }

  private dropVideo(): void {
    this.video.pause();
    if (this.url) { URL.revokeObjectURL(this.url); this.video.removeAttribute('src'); this.video.load(); }
    this.url = null;
  }

  private fitBlank(): void { this.clock.duration = blankDuration(this.session ? this.session.source.duration : null); }

  /** Shows a video file. Position and play state of a previous one are not carried over: a new file is a new start. */
  setVideo(file: File): void {
    this.clock.pause();
    this.blank = false;
    this.dropVideo();
    this.url = URL.createObjectURL(file);
    this.media = this.video;
    this.par.setOptions({ video: this.video, clock: null, region: 'video', videoFps: null });
    this.video.src = this.url;
  }

  /** Opens a subtitle; a newer call cancels the one before. Resolves with the session, or null when it was replaced meanwhile. */
  async setSubtitle(file: File, progress: (done: number, total: number) => void): Promise<StudioSession | null> {
    this.abort?.abort();
    const ac = (this.abort = new AbortController());
    const s = await openSession(file, file.name, { signal: ac.signal, onProgress: progress });
    if (ac.signal.aborted) { s.source.close?.(); return null; }
    this.session?.source.close?.();
    this.session = s;
    this.par.setSubtitle(s.source);
    this.fitBlank();
    return s;
  }

  destroy(): void {
    this.abort?.abort();
    this.par.destroy();
    if (this.url) URL.revokeObjectURL(this.url);
  }
}
