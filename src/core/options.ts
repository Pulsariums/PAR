import { frameIndex, frameRate } from './time';
import { MAX_FPS, MIN_FPS } from '../clock/Scheduler';
import type { DefaultLayoutOption, FpsOption, LayoutOption, PAROptions, RegionOption, ResolvedOptions } from '../types/options';

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export const validateFps = (fps: FpsOption): FpsOption => {
  if (fps === 'auto') return fps;
  if (!finite(fps) || fps < MIN_FPS || fps > MAX_FPS) {
    throw new RangeError(`PAR: fps must be 'auto' or a number in ${MIN_FPS}..${MAX_FPS}, got ${String(fps)}`);
  }
  return fps;
};

export const validateRegion = (r: RegionOption): RegionOption => {
  if (r === 'video' || r === 'container') return r;
  if (r && typeof r === 'object' && finite(r.x) && finite(r.y) && finite(r.width) && finite(r.height) && r.width > 0 && r.height > 0) {
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  throw new TypeError(`PAR: region must be 'video', 'container' or { x, y, width, height } with positive size`);
};

export const validateDefaultLayout = (l: DefaultLayoutOption): DefaultLayoutOption => {
  if (l === '1080p' || l === '720p' || l === 'libass') return l;
  if (l && typeof l === 'object' && finite(l.width) && finite(l.height) && l.width > 0 && l.height > 0) return { width: l.width, height: l.height };
  throw new TypeError(`PAR: defaultLayout must be '1080p', '720p', 'libass' or { width, height } with positive size`);
};

export const validateWindow = (w: number): number => {
  if (!finite(w) || w < 1) throw new RangeError('PAR: windowSeconds must be a number >= 1');
  return w;
};

export const validateWarmRange = (w: number): number => {
  if (!finite(w) || w < 1 || w > 300) throw new RangeError('PAR: warmRangeSeconds must be a number in 1..300');
  return w;
};

export const validateTemperature = (v: number): number => {
  if (!finite(v) || v < 1) throw new RangeError('PAR: temperature must be a number >= 1');
  return Math.max(1, Math.floor(v));
};

export const validateMode = (m: unknown): 'auto' | 'dom' | 'canvas' => {
  if (m === 'auto' || m === 'dom' || m === 'canvas') return m;
  throw new TypeError(`PAR: renderMode must be 'auto', 'dom' or 'canvas'`);
};

export const validateLayout = (l: LayoutOption): LayoutOption => {
  if (l === 'script') return l;
  if (l && typeof l === 'object' && finite(l.width) && finite(l.height) && l.width > 0 && l.height > 0) {
    return { width: l.width, height: l.height };
  }
  throw new TypeError(`PAR: layout must be 'script' or { width, height } with positive size`);
};

/** Merges `patch` over `prev` (or defaults) and validates the result. */
export const resolveOptions = (patch: PAROptions, prev?: ResolvedOptions): ResolvedOptions => {
  const video = patch.video !== undefined ? patch.video : prev?.video ?? null;
  const container = (patch.container !== undefined ? patch.container : prev?.container) ?? video?.parentElement ?? null;
  if (!container) throw new TypeError('PAR: a container element is required (or a video element that has a parent)');
  const videoFps = patch.videoFps !== undefined ? patch.videoFps : prev?.videoFps ?? null;
  if (videoFps !== null && !(finite(videoFps) && videoFps > 0)) throw new RangeError('PAR: videoFps must be a positive number or null');
  const timeOffset = patch.timeOffset ?? prev?.timeOffset ?? 0;
  if (!finite(timeOffset)) throw new TypeError('PAR: timeOffset must be a finite number');
  return {
    video,
    container,
    region: validateRegion(patch.region ?? prev?.region ?? (video ? 'video' : 'container')),
    layout: validateLayout(patch.layout ?? prev?.layout ?? 'script'),
    defaultLayout: validateDefaultLayout(patch.defaultLayout ?? prev?.defaultLayout ?? '1080p'),
    fps: validateFps(patch.fps ?? prev?.fps ?? 'auto'),
    videoFps,
    clock: patch.clock !== undefined ? patch.clock : prev?.clock ?? null,
    timeOffset,
    fontMap: { ...(patch.fontMap ?? prev?.fontMap ?? {}) },
    useLocalFonts: patch.useLocalFonts ?? prev?.useLocalFonts ?? false,
    embeddedFonts: patch.embeddedFonts ?? prev?.embeddedFonts ?? true,
    fontProviders: [...(patch.fontProviders ?? prev?.fontProviders ?? [])],
    providerTimeout: patch.providerTimeout ?? prev?.providerTimeout ?? 5000,
    onMissingFonts: patch.onMissingFonts !== undefined ? patch.onMissingFonts : prev?.onMissingFonts ?? null,
    windowSeconds: validateWindow(patch.windowSeconds ?? prev?.windowSeconds ?? 12),
    warmRangeSeconds: validateWarmRange(patch.warmRangeSeconds ?? prev?.warmRangeSeconds ?? 30),
    temperature: validateTemperature(patch.temperature ?? prev?.temperature ?? 50),
    seekBuffer: patch.seekBuffer ?? prev?.seekBuffer ?? true,
    zIndex: patch.zIndex ?? prev?.zIndex ?? 1,
    renderMode: validateMode(patch.renderMode ?? prev?.renderMode ?? 'auto'),
    spriteCacheMB: finite(patch.spriteCacheMB) && patch.spriteCacheMB > 0 ? patch.spriteCacheMB : prev?.spriteCacheMB ?? 96,
  };
};

/** Snaps to the start of the containing frame, in seconds (exact NTSC fractions, see `time.ts`). Without fps: unchanged. */
export const snapToFrame = (t: number, fps: number | null): number => {
  if (!fps) return t;
  const r = frameRate(fps);
  return (frameIndex(t, r) * r.den) / r.num;
};
