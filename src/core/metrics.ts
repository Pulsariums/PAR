import type { ResolvedLayout } from '../layout/resolve';
import { canvasSupported } from '../canvas/raster';
import type { CanvasStats } from '../canvas/types';
import type { PARMetrics, Rect, RenderMetrics } from '../types/options';

export interface Geometry {
  region: Rect;
  scale: { x: number; y: number };
  layout: ResolvedLayout;
}

/** Virtual (layout) and real (region) size side by side, plus the old flat fields (`layout`, `scaleX`, `scaleY`, `region`). */
export const buildMetrics = (g: Geometry, live: Pick<PARMetrics, 'time' | 'activeLines' | 'running' | 'render'>): PARMetrics => ({
  region: { ...g.region }, layout: { ...g.layout.size }, scaleX: g.scale.x, scaleY: g.scale.y,
  layoutSize: { ...g.layout.size }, regionSize: { width: g.region.width, height: g.region.height }, scale: { ...g.scale },
  layoutSource: g.layout.source, layoutDerived: g.layout.derived, ...live,
});

export const renderMetrics = (
  r: { canvas: CanvasStats; domLines: number; canvasLines: number; stalls: number; stallMs: number }, mode: RenderMetrics['mode'], frameMs: RenderMetrics['frameMs'],
): RenderMetrics => ({
  mode, canvasSupported: canvasSupported(), domLines: r.domLines, canvasLines: r.canvasLines, canvasRuns: r.canvas.runs, runsMerged: r.canvas.runsMerged,
  drawn: r.canvas.drawn, fillMpx: r.canvas.fillMpx, shed: r.canvas.shed, shedBudgetMpx: r.canvas.shedBudgetMpx,
  sprites: r.canvas.sprites, spriteBytes: r.canvas.spriteBytes, spriteHits: r.canvas.spriteHits, spriteMisses: r.canvas.spriteMisses,
  prewarmed: r.canvas.prewarmed, workers: r.canvas.workers, workerBuilt: r.canvas.workerBuilt, planQueued: r.canvas.planQueued, planLeadMs: r.canvas.leadMs, evictions: r.canvas.evictions, missing: r.canvas.missing, missedTotal: r.canvas.missedTotal, held: r.canvas.held, pending: r.canvas.pending, readyMs: r.canvas.readyMs, deficitMs: r.canvas.deficitMs, buildRate: r.canvas.rate, stalls: r.stalls, stallMs: Math.round(r.stallMs), compositeMs: r.canvas.compositeMs, detailDropped: r.canvas.detailDropped, skipped: r.canvas.skipped, frameMs,
});
