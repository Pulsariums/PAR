import { create, type PARRenderer } from '../../../src/index';
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

  constructor(readonly box: HTMLElement, readonly video: HTMLVideoElement) {
    this.par = create({ container: box, video, zIndex: 1, spriteCacheMB: cacheMB() });
  }

  get hasVideo(): boolean { return this.url !== null; }

  /** Shows a video file. Position and play state of a previous one are not carried over: a new file is a new start. */
  setVideo(file: File): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(file);
    this.par.setOptions({ videoFps: null });
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
    return s;
  }

  destroy(): void {
    this.abort?.abort();
    this.par.destroy();
    if (this.url) URL.revokeObjectURL(this.url);
  }
}
