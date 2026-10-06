import type { DefaultLayoutOption, LayoutOption, Rect } from '../types/options';
import type { ScriptInfo } from '../types/script';

import { resolveLayout } from './resolve';

export interface Size {
  width: number;
  height: number;
}

/** Virtual coordinate space of a script (see `resolveLayout` for the full rule); kept for callers that only need the size. */
export const resolveLayoutSize = (option: LayoutOption, info: ScriptInfo | null, def: DefaultLayoutOption = '1080p', aspect?: Size | null): Size =>
  resolveLayout(option, info, def, aspect).size;

export interface StageTransform {
  /** Screen pixels per layout unit. */
  scaleX: number;
  scaleY: number;
  /** Multiplier for border and shadow in layout units (1 when ScaledBorderAndShadow=yes or without a storage size). */
  borderScale: number;
  /** Multiplier for `\blur` in layout units (libass blur_scale: layout height / LayoutRes-or-storage height). */
  blurScale: number;
}

/**
 * Maps the layout space onto the region (non-uniform when aspect ratios differ, like VSFilter).
 * `storage` is the size libass calls layout resolution: LayoutResX/Y of the script, else the video's
 * pixel size (what mpv / JASSUB pass), else unknown (null). Like libass (init_font_scale):
 * blur always scales by layout/storage; border and shadow only with `ScaledBorderAndShadow: no`
 * (with yes they follow PlayRes, i.e. 1 in layout units). Unknown storage => both 1.
 */
export const stageTransform = (region: Rect, layout: Size, scaledBorderAndShadow: boolean, storage: Size | null = null): StageTransform => {
  const scaleX = layout.width > 0 ? region.width / layout.width : 0;
  const scaleY = layout.height > 0 ? region.height / layout.height : 0;
  const ratio = storage && storage.height > 0 && layout.height > 0 ? layout.height / storage.height : 1;
  return { scaleX, scaleY, borderScale: scaledBorderAndShadow ? 1 : ratio, blurScale: ratio };
};
