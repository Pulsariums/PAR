import { MAX_FPS, MIN_FPS } from '../clock/Scheduler';
import type { FpsOption, LayoutOption, PAROptions, RegionOption, ResolvedOptions } from '../types/options';

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
    fps: validateFps(patch.fps ?? prev?.fps ?? 'auto'),
    videoFps,
    clock: patch.clock !== undefined ? patch.clock : prev?.clock ?? null,
    timeOffset,
    fontMap: { ...(patch.fontMap ?? prev?.fontMap ?? {}) },
    zIndex: patch.zIndex ?? prev?.zIndex ?? 1,
  };
};

/** Snaps to the start of the containing frame (small epsilon absorbs float error, e.g. 0.1 * 30). */
export const snapToFrame = (t: number, fps: number | null): number =>
  fps ? Math.floor(t * fps + 1e-6) / fps : t;
