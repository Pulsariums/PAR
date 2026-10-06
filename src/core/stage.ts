import { stageTransform, type Size, type StageTransform } from '../layout/Layout';
import { resolveLayout, type ResolvedLayout } from '../layout/resolve';
import { resolveRegion } from '../layout/Region';
import type { Rect, ResolvedOptions } from '../types/options';
import type { ScriptInfo } from '../types/script';

import { measureRegionInput } from './measure';

export interface Stage {
  region: Rect;
  layout: Size;
  resolved: ResolvedLayout;
  transform: StageTransform;
}

/** libass layout resolution: script LayoutResX/Y, else the video's own pixel size, else unknown. */
export const storageSize = (info: ScriptInfo | null, video: HTMLVideoElement | null): Size | null => {
  if (info?.layoutResX && info.layoutResY) return { width: info.layoutResX, height: info.layoutResY };
  return video && video.videoWidth > 0 && video.videoHeight > 0 ? { width: video.videoWidth, height: video.videoHeight } : null;
};

/** Region (DOM reads), virtual layout size and the layout => screen transform for the current options. */
export const computeStage = (opts: ResolvedOptions, info: ScriptInfo | null): Stage => {
  const region = resolveRegion(opts.region, measureRegionInput(opts.container, opts.video));
  const resolved = resolveLayout(opts.layout, info, opts.defaultLayout, region);
  const layout = resolved.size;
  return { region, layout, resolved, transform: stageTransform(region, layout, info?.scaledBorderAndShadow ?? false, storageSize(info, opts.video)) };
};

/** Device pixels per layout unit: region width (CSS px) times the display's pixel ratio over the layout width. */
export const deviceScale = (el: HTMLElement, regionW: number, layoutW: number): number => {
  const dpr = el.ownerDocument.defaultView?.devicePixelRatio ?? 1;
  return layoutW > 0 && regionW > 0 ? Math.round(((regionW * dpr) / layoutW) * 1000) / 1000 : 1;
};
