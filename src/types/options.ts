/** Public option types. */

/** A rectangle in CSS pixels, relative to the container's padding box. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where on screen the subtitles are placed.
 * - `'video'`: the visible picture of the `<video>` (letterbox-aware, honours `object-fit`).
 * - `'container'`: the whole container element.
 * - `Rect`: an explicit rectangle in container pixels.
 */
export type RegionOption = 'video' | 'container' | Rect;

/**
 * The virtual coordinate space ASS is laid out in.
 * - `'script'`: PlayResX/PlayResY of the script (libass fallbacks when missing).
 * - `{ width, height }`: treat the script as authored for this size (ignores PlayRes).
 */
export type LayoutOption = 'script' | { width: number; height: number };

/** `'auto'` = every video frame (requestVideoFrameCallback) or display frame (rAF); number = 10..200 fps cap. */
export type FpsOption = 'auto' | number;

/** Returns the current media time in seconds. */
export type ClockFn = () => number;

export interface PAROptions {
  /** Video element to follow (time, play/pause/seek, size). */
  video?: HTMLVideoElement | null;
  /** Element the overlay is mounted into. Default: `video.parentElement`. Required without `video`. */
  container?: HTMLElement | null;
  /** Raw .ass/.ssa text. */
  subtitle?: string;
  /** Default: `'video'` with a video, otherwise `'container'`. */
  region?: RegionOption;
  /** Default: `'script'`. */
  layout?: LayoutOption;
  /** Render rate. Default `'auto'`. */
  fps?: FpsOption;
  /** Source video frame rate. When set, time is snapped to frame starts (like libass consumers do). */
  videoFps?: number | null;
  /** Custom clock (seconds). Default: `video.currentTime`. Without video and clock, call `renderAt()` yourself. */
  clock?: ClockFn | null;
  /** Seconds added to the clock before rendering (subtitle delay). Default 0. */
  timeOffset?: number;
  /** Maps ASS font names to CSS font-family values, e.g. `{ 'Open Sans Semibold': '"Open Sans", sans-serif' }`. */
  fontMap?: Record<string, string>;
  /** CSS z-index of the overlay. Default 1. */
  zIndex?: number;
}

/** Fully resolved options (internal). */
export interface ResolvedOptions {
  video: HTMLVideoElement | null;
  container: HTMLElement;
  region: RegionOption;
  layout: LayoutOption;
  fps: FpsOption;
  videoFps: number | null;
  clock: ClockFn | null;
  timeOffset: number;
  fontMap: Record<string, string>;
  zIndex: number;
}

export interface PARMetrics {
  /** Region in container pixels. */
  region: Rect;
  /** Virtual layout size (coordinate space of the script). */
  layout: { width: number; height: number };
  /** Screen pixels per layout unit. */
  scaleX: number;
  scaleY: number;
  /** Last rendered subtitle time in seconds (after offset and frame snapping), NaN before the first render. */
  time: number;
  /** Events currently on screen. */
  activeLines: number;
  /** Whether the internal render loop is running. */
  running: boolean;
}
