import { create, type PARRenderer, type SubtitleSource } from '../../../src/index';

import { drawCard } from './testcard';
import { CardTransport, VideoTransport, type Transport } from './transport';

/** Owns the PAR instance and the two transports (test card clock, video element). */
export class Player {
  readonly card = new CardTransport();
  readonly par: PARRenderer;
  transport: Transport = this.card;
  hasVideo = false;
  /** The subtitle text last given to PAR (the "characters this subtitle uses" check scans it). */
  text = '';
  private readonly videoTransport: VideoTransport;
  private lastDrawn = NaN;

  constructor(
    readonly stage: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    readonly video: HTMLVideoElement,
    subtitle: string,
  ) {
    this.videoTransport = new VideoTransport(video);
    this.text = subtitle;
    this.par = create({ container: stage, clock: () => this.card.time, subtitle });
    this.fitDuration();
  }

  /** Sets the subtitle and sizes the card timeline to the last event end. */
  setSubtitle(text: string): void {
    this.text = text;
    this.par.setSubtitle(text);
    this.fitDuration();
  }

  /** Plays a windowed source (big file, XPAR, PAR): the timeline is exactly its duration. */
  setSource(source: SubtitleSource): void {
    this.text = '';
    this.par.setSubtitle(source);
    this.card.duration = Math.max(0.01, source.duration);
  }

  private fitDuration(): void {
    const end = this.par.script?.events.reduce((m, e) => Math.max(m, e.end), 0) ?? 0;
    this.card.duration = Math.max(4, Math.ceil(end));
  }

  useCard(): void {
    if (this.hasVideo) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }
    this.hasVideo = false;
    this.video.hidden = true;
    this.canvas.hidden = false;
    this.transport = this.card;
    this.par.setOptions({ video: null, clock: () => this.card.time });
  }

  useVideo(src: string): void {
    this.video.hidden = false;
    this.canvas.hidden = true;
    this.video.loop = true;
    this.video.src = src;
    this.hasVideo = true;
    this.card.pause();
    this.transport = this.videoTransport;
    this.par.setOptions({ video: this.video, clock: null });
  }

  /** Called every animation frame: redraws the test card when its time changed. */
  tick(): void {
    if (this.hasVideo) return;
    const t = this.card.time;
    const size = this.canvas.clientWidth;
    const w = Math.max(320, Math.min(1280, Math.round(size * (window.devicePixelRatio || 1))));
    if (this.canvas.width !== w) { this.canvas.width = w; this.canvas.height = Math.round((w * 9) / 16); this.lastDrawn = NaN; }
    if (t !== this.lastDrawn) { drawCard(this.canvas, t); this.lastDrawn = t; }
  }
}
