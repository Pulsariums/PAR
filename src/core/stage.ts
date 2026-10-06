import { resolveLayoutSize, stageTransform, type Size, type StageTransform } from '../layout/Layout';
import { resolveRegion } from '../layout/Region';
import type { Rect, ResolvedOptions } from '../types/options';
import type { ScriptInfo } from '../types/script';

import { measureRegionInput } from './measure';

export interface Stage {
  region: Rect;
  layout: Size;
  transform: StageTransform;
}

/** Region (DOM reads), virtual layout size and the layout => screen transform for the current options. */
export const computeStage = (opts: ResolvedOptions, info: ScriptInfo | null): Stage => {
  const region = resolveRegion(opts.region, measureRegionInput(opts.container, opts.video));
  const layout = resolveLayoutSize(opts.layout, info);
  return { region, layout, transform: stageTransform(region, layout, info?.scaledBorderAndShadow ?? true) };
};
