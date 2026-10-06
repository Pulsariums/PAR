import type { DefaultLayoutOption, LayoutOption, Rect } from '../types/options';
import type { ScriptInfo } from '../types/script';

import { resolveLayout } from './resolve';

export interface Size {
  width: number;
  height: number;
}

/** Virtual coordinate space of a script (see `resolveLayout` for the full rule); kept for callers that only need the size. */
export const resolveLayoutSize = (option: LayoutOption, info: ScriptInfo | null, def: DefaultLayoutOption = '720p', aspect?: Size | null): Size =>
  resolveLayout(option, info, def, aspect).size;

export interface StageTransform {
  /** Screen pixels per layout unit. */
  scaleX: number;
  scaleY: number;
  /** Multiplier for border/shadow/blur values (1 when ScaledBorderAndShadow=yes). */
  borderScale: number;
}

/**
 * Maps the layout space onto the region (non-uniform when aspect ratios differ, like VSFilter).
 * With `ScaledBorderAndShadow: no`, border and shadow sizes are screen pixels, so in layout
 * units they are divided by the vertical scale.
 */
export const stageTransform = (region: Rect, layout: Size, scaledBorderAndShadow: boolean): StageTransform => {
  const scaleX = layout.width > 0 ? region.width / layout.width : 0;
  const scaleY = layout.height > 0 ? region.height / layout.height : 0;
  const borderScale = scaledBorderAndShadow || scaleY <= 0 ? 1 : 1 / scaleY;
  return { scaleX, scaleY, borderScale };
};
