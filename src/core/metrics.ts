import type { ResolvedLayout } from '../layout/resolve';
import type { PARMetrics, Rect } from '../types/options';

export interface Geometry {
  region: Rect;
  scale: { x: number; y: number };
  layout: ResolvedLayout;
}

/** Virtual (layout) and real (region) size side by side, plus the old flat fields (`layout`, `scaleX`, `scaleY`, `region`). */
export const buildMetrics = (g: Geometry, live: Pick<PARMetrics, 'time' | 'activeLines' | 'running'>): PARMetrics => ({
  region: { ...g.region }, layout: { ...g.layout.size }, scaleX: g.scale.x, scaleY: g.scale.y,
  layoutSize: { ...g.layout.size }, regionSize: { width: g.region.width, height: g.region.height }, scale: { ...g.scale },
  layoutSource: g.layout.source, layoutDerived: g.layout.derived, ...live,
});
