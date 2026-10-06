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

/**
 * Virtual size used when the script has no PlayRes at all (layout option and script both silent).
 * - `'720p'` (default): 1280x720.
 * - `'libass'`: 384x288, what libass / VSFilter use (strict compatibility).
 * - `{ width, height }`: your own default.
 */
export type DefaultLayoutOption = '720p' | 'libass' | { width: number; height: number };

/** Where the virtual layout size came from: the `layout` option, the script's PlayRes, or `defaultLayout`. */
export type LayoutSource = 'option' | 'script' | 'default';

/** `'auto'` = every video frame (requestVideoFrameCallback) or display frame (rAF); number = 10..200 fps cap. */
export type FpsOption = 'auto' | number;

/** Returns the current media time in seconds. */
export type ClockFn = () => number;

import type { FontProvider } from '../fonts/provider';
import type { FontSpec } from '../fonts/types';
import type { MissingFontsHandler } from '../core/MissingFonts';
import type { SubtitleSource } from '../source/types';

export interface PAROptions {
  /** Video element to follow (time, play/pause/seek, size). */
  video?: HTMLVideoElement | null;
  /** Element the overlay is mounted into. Default: `video.parentElement`. Required without `video`. */
  container?: HTMLElement | null;
  /** Raw .ass/.ssa text, or a `SubtitleSource` (`fromAssFile`, `fromXpar`, `openSourceInWorker`...) that is played through a sliding window. */
  subtitle?: string | SubtitleSource;
  /** Default: `'video'` with a video, otherwise `'container'`. */
  region?: RegionOption;
  /** Default: `'script'`. */
  layout?: LayoutOption;
  /** Virtual size for scripts without PlayRes. Default `'720p'`. See `DefaultLayoutOption`. */
  defaultLayout?: DefaultLayoutOption;
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
  /** Fonts to load now (File, Blob, bytes, URL, or `{ source, family }`). Same as calling `addFonts` after creating. */
  fonts?: FontSpec[];
  /** Ask the browser for installed fonts (Local Font Access API) and use them for names nothing else covers. Never required. */
  useLocalFonts?: boolean;
  /** Load fonts embedded in the script's `[Fonts]` section. Default true. Read when a script is loaded (`setSubtitle`). */
  embeddedFonts?: boolean;
  /**
   * Font providers (font library, URL map, host cache), asked in array order for families that user / embedded faces and
   * `fontMap` do not cover, before installed fonts. Drawing waits for their answers, at most `providerTimeout` ms.
   */
  fontProviders?: FontProvider[];
  /** Per provider call, ms (a provider that stays silent counts as "not found"). Default 5000. */
  providerTimeout?: number;
  /** Decides what happens when the script's fonts are missing. Default (not set): continue with fallback fonts. `null` clears it. */
  onMissingFonts?: MissingFontsHandler | null;
  /** `subtitle` given as a `SubtitleSource`: seconds of events kept in memory (about 1/6 behind the playhead, the rest ahead). Default 12. Read when a source is loaded. */
  windowSeconds?: number;
  /** CSS z-index of the overlay. Default 1. */
  zIndex?: number;
}

/** Fully resolved options (internal). */
export interface ResolvedOptions {
  video: HTMLVideoElement | null;
  container: HTMLElement;
  region: RegionOption;
  layout: LayoutOption;
  defaultLayout: DefaultLayoutOption;
  fps: FpsOption;
  videoFps: number | null;
  clock: ClockFn | null;
  timeOffset: number;
  fontMap: Record<string, string>;
  useLocalFonts: boolean;
  embeddedFonts: boolean;
  fontProviders: FontProvider[];
  providerTimeout: number;
  onMissingFonts: MissingFontsHandler | null;
  windowSeconds: number;
  zIndex: number;
}

export interface PARMetrics {
  /** Region in container pixels. */
  region: Rect;
  /** Virtual layout size (coordinate space of the script). Same as `layoutSize`. */
  layout: { width: number; height: number };
  /** Virtual size: the coordinate space the layout is calculated in. */
  layoutSize: { width: number; height: number };
  /** Real size: the displayed region in CSS pixels (the virtual frame is scaled onto it). */
  regionSize: { width: number; height: number };
  /** Real / virtual (screen pixels per layout unit). */
  scale: { x: number; y: number };
  /** Where `layoutSize` came from. */
  layoutSource: LayoutSource;
  /** True when one PlayRes side was missing and the other was derived (aspect ratio or the libass 4:3 rule). */
  layoutDerived: boolean;
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
