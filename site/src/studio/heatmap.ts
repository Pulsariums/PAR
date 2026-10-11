import type { ChunkRef } from '../../../src/format/indexBlock';
import { parseScript } from '../../../src/parser/ScriptParser';
import type { AssEvent } from '../../../src/types/script';
import type { Player } from '../player/player';
import type { StudioSession } from './session';

const DEFAULT_BINS = 300;

/** Computes raw density bins across duration from a list of start/end events. */
export const computeEventsDensity = (events: readonly AssEvent[], duration: number, binsCount = DEFAULT_BINS): Float32Array => {
  const density = new Float32Array(binsCount);
  if (duration <= 0 || events.length === 0) return density;
  for (const e of events) {
    if (e.end <= 0 || e.start >= duration) continue;
    const start = Math.max(0, e.start);
    const end = Math.min(duration, Math.max(start, e.end));
    const b0 = Math.max(0, Math.min(binsCount - 1, Math.floor((start / duration) * binsCount)));
    const b1 = Math.max(0, Math.min(binsCount - 1, Math.floor((end / duration) * binsCount)));
    for (let b = b0; b <= b1; b++) {
      density[b] += 1;
    }
  }
  return density;
};

/** Computes raw density bins across duration from XPAR/PAR chunk metadata. */
export const computeChunksDensity = (chunks: readonly ChunkRef[], duration: number, binsCount = DEFAULT_BINS): Float32Array => {
  const density = new Float32Array(binsCount);
  if (duration <= 0 || chunks.length === 0) return density;
  for (const c of chunks) {
    const t0 = Math.max(0, c.minStartMs / 1000);
    const t1 = Math.min(duration, Math.max(t0, c.maxEndMs / 1000));
    const b0 = Math.max(0, Math.min(binsCount - 1, Math.floor((t0 / duration) * binsCount)));
    const b1 = Math.max(0, Math.min(binsCount - 1, Math.floor((t1 / duration) * binsCount)));
    const span = Math.max(1, b1 - b0 + 1);
    const add = c.count / span;
    for (let b = b0; b <= b1; b++) {
      density[b] += add;
    }
  }
  return density;
};

/** Smooths raw density bins using a weighted moving average kernel. */
export const smoothBins = (raw: Float32Array): Float32Array => {
  const n = raw.length;
  const out = new Float32Array(n);
  const kernel = [0.04, 0.09, 0.18, 0.38, 0.18, 0.09, 0.04];
  const radius = 3;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let wSum = 0;
    for (let k = -radius; k <= radius; k++) {
      const idx = Math.min(n - 1, Math.max(0, i + k));
      const w = kernel[k + radius]!;
      sum += raw[idx]! * w;
      wSum += w;
    }
    out[i] = wSum > 0 ? sum / wSum : 0;
  }
  return out;
};

/** Normalizes smoothed bins to [0, 1] with a subtle non-linear lift for readability. */
export const normalizeBins = (smoothed: Float32Array): Float32Array => {
  const n = smoothed.length;
  const out = new Float32Array(n);
  let max = 0;
  for (let i = 0; i < n; i++) {
    if (smoothed[i]! > max) max = smoothed[i]!;
  }
  if (max <= 0) return out;
  for (let i = 0; i < n; i++) {
    const ratio = smoothed[i]! / max;
    // Sub-linear curve (power 0.78) so subtle dialogue and background events stay visible
    out[i] = Math.pow(ratio, 0.78);
  }
  return out;
};

const parseRgb = (color: string): [number, number, number] => {
  const c = color.trim();
  if (c.startsWith('#')) {
    const hex = c.slice(1);
    if (hex.length === 3) {
      return [parseInt(hex[0]! + hex[0]!, 16), parseInt(hex[1]! + hex[1]!, 16), parseInt(hex[2]! + hex[2]!, 16)];
    }
    if (hex.length >= 6) {
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    }
  }
  const m = /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return [165, 148, 255];
};

interface Point {
  x: number;
  y: number;
}

/** Draws a closed polygon under the smoothed spline path. */
const traceElevationPath = (ctx: CanvasRenderingContext2D, points: readonly Point[], w: number, h: number): void => {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(points[0]!.x, points[0]!.y);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
};

/** Draws only the top curve edge of the spline path. */
const traceStrokePath = (ctx: CanvasRenderingContext2D, points: readonly Point[]): void => {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
};

/** Manages and renders the YouTube-like elevation heatmap on the transport seekbar. */
export class TimelineHeatmap {
  private bins: Float32Array | null = null;
  private duration = 0;
  private currentTime = 0;
  private resizeObserver: ResizeObserver | null = null;
  private token = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.render();
      });
      this.resizeObserver.observe(this.canvas);
    }
  }

  /** Clears the heatmap curve and resets state. */
  clear(): void {
    this.token++;
    this.bins = null;
    this.duration = 0;
    this.currentTime = 0;
    const ctx = this.canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Synchronizes heatmap data with the current session or loaded player script. */
  async sync(session: StudioSession | null, player?: Player): Promise<void> {
    const curToken = ++this.token;
    const dur = session?.source.duration || player?.transport.duration || 0;
    if (dur <= 0) {
      this.clear();
      return;
    }
    this.duration = dur;

    // Fast path 1: Chunks metadata available from XPAR/PAR
    if (session?.chunks && session.chunks.length > 0) {
      const raw = computeChunksDensity(session.chunks, dur, DEFAULT_BINS);
      this.bins = normalizeBins(smoothBins(raw));
      this.render();
      return;
    }

    // Fast path 2: In-memory events from player
    const playerEvents = player?.par.script?.events;
    if (playerEvents && playerEvents.length > 0) {
      const raw = computeEventsDensity(playerEvents, dur, DEFAULT_BINS);
      this.bins = normalizeBins(smoothBins(raw));
      this.render();
      return;
    }

    // Path 3: ASS text from session blob
    if (session && session.kind === 'ass') {
      try {
        const text = await session.blob.text();
        if (curToken !== this.token) return;
        const parsed = parseScript(text);
        const raw = computeEventsDensity(parsed.events, dur, DEFAULT_BINS);
        this.bins = normalizeBins(smoothBins(raw));
        this.render();
        return;
      } catch {
        // Fall back to window sampling
      }
    }

    // Path 4: Window sampling for generic SubtitleSource
    if (session?.source) {
      try {
        const sampleCount = Math.min(40, Math.max(10, Math.ceil(dur / 4)));
        const step = dur / sampleCount;
        const allSampled: AssEvent[] = [];
        for (let i = 0; i < sampleCount; i++) {
          if (curToken !== this.token) return;
          const t0 = i * step;
          const t1 = Math.min(dur, t0 + step);
          const evs = await session.source.readWindow(t0, t1);
          allSampled.push(...evs);
        }
        if (curToken !== this.token) return;
        const raw = computeEventsDensity(allSampled, dur, DEFAULT_BINS);
        this.bins = normalizeBins(smoothBins(raw));
        this.render();
      } catch {
        this.clear();
      }
    }
  }

  /** Updates the playback progress and redraws the active portion. */
  setTime(time: number, duration?: number): void {
    if (duration !== undefined && duration > 0 && Math.abs(duration - this.duration) > 0.05) {
      this.duration = duration;
    }
    if (Math.abs(this.currentTime - time) < 0.005) return;
    this.currentTime = time;
    this.render();
  }

  /** Renders the elevation curve and playback active highlight to canvas. */
  render(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);

    if (w <= 0 || h <= 0) return;

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);

    if (!this.bins || this.duration <= 0) return;

    const bins = this.bins;
    const n = bins.length;
    if (n < 2) return;

    const topPad = 3 * dpr;
    const botPad = 2 * dpr;
    const usableH = h - topPad - botPad;

    const points: Point[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const val = bins[i]!;
      const y = h - botPad - val * usableH;
      points[i] = { x, y };
    }

    const style = getComputedStyle(this.canvas);
    const accentStr = style.getPropertyValue('--accent') || '#a594ff';
    const [r, g, b] = parseRgb(accentStr);

    // Pass 1: Unplayed base curve (subtle gradient + crisp top stroke)
    const baseGrad = ctx.createLinearGradient(0, topPad, 0, h);
    baseGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.28)`);
    baseGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.01)`);

    ctx.save();
    traceElevationPath(ctx, points, w, h);
    ctx.fillStyle = baseGrad;
    ctx.fill();

    traceStrokePath(ctx, points);
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.45)`;
    ctx.lineWidth = Math.max(1, 1.25 * dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();

    // Pass 2: Played active portion highlight (clipped to played head)
    const progress = this.duration > 0 ? Math.min(1, Math.max(0, this.currentTime / this.duration)) : 0;
    const playedX = progress * w;

    if (playedX > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, playedX, h);
      ctx.clip();

      const activeGrad = ctx.createLinearGradient(0, topPad, 0, h);
      activeGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.65)`);
      activeGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.05)`);

      traceElevationPath(ctx, points, w, h);
      ctx.fillStyle = activeGrad;
      ctx.fill();

      traceStrokePath(ctx, points);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
      ctx.lineWidth = Math.max(1.2, 1.75 * dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.restore();
    }
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.clear();
  }
}

/** Factory helper to initialize the TimelineHeatmap on a given canvas. */
export const initHeatmap = (canvas: HTMLCanvasElement): TimelineHeatmap => new TimelineHeatmap(canvas);
