import { describe, expect, it } from 'vitest';

import type { ChunkRef } from '../src/format/indexBlock';
import type { AssEvent } from '../src/types/script';
import {
  computeChunksDensity,
  computeEventsDensity,
  normalizeBins,
  smoothBins,
  TimelineHeatmap,
} from '../site/src/studio/heatmap';

describe('heatmap density and smoothing', () => {
  it('computes event density across bins', () => {
    const events = [
      { start: 0, end: 10 },
      { start: 5, end: 15 },
    ] as unknown as AssEvent[];
    const duration = 20;
    const bins = computeEventsDensity(events, duration, 100);
    expect(bins.length).toBe(100);

    // bin at t=2 (index 10) has 1 event
    expect(bins[10]).toBe(1);
    // bin at t=7.5 (index ~37) has 2 events (overlap of both)
    expect(bins[37]).toBe(2);
    // bin at t=18 (index 90) has 0 events
    expect(bins[90]).toBe(0);
  });

  it('handles empty events or duration <= 0', () => {
    expect(computeEventsDensity([], 100, 50).every((v) => v === 0)).toBe(true);
    expect(computeEventsDensity([{ start: 0, end: 5 } as AssEvent], 0, 50).every((v) => v === 0)).toBe(true);
  });

  it('computes chunk density across bins', () => {
    const chunks: ChunkRef[] = [
      { offset: 0, len: 10, rawLen: 10, codec: 0, lane: 0, count: 50, minStartMs: 0, maxEndMs: 10000, minLine: 0, maxLine: 50, crc: 0 },
      { offset: 10, len: 10, rawLen: 10, codec: 0, lane: 0, count: 100, minStartMs: 10000, maxEndMs: 20000, minLine: 51, maxLine: 150, crc: 0 },
    ];
    const duration = 20;
    const bins = computeChunksDensity(chunks, duration, 100);
    expect(bins.length).toBe(100);

    // First half (0..49) has 50 events distributed across 50 bins => 1 event/bin
    expect(bins[20]).toBeGreaterThan(0);
    // Second half (50..99) has 100 events distributed across 50 bins => 2 events/bin
    expect(bins[70]).toBeGreaterThan(bins[20]);
  });

  it('smooths and normalizes bins cleanly', () => {
    const raw = new Float32Array(50);
    raw[25] = 100; // single spike
    const smoothed = smoothBins(raw);
    // Adjacent bins should receive smoothed energy
    expect(smoothed[24]).toBeGreaterThan(0);
    expect(smoothed[26]).toBeGreaterThan(0);
    expect(smoothed[25]).toBeLessThan(100);

    const norm = normalizeBins(smoothed);
    expect(Math.max(...norm)).toBeCloseTo(1, 2);
    expect(norm[0]).toBe(0);
  });

  it('renders without error on a canvas mock and updates playback time', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { value: 300 });
    Object.defineProperty(canvas, 'clientHeight', { value: 30 });
    canvas.getBoundingClientRect = () => ({
      width: 300,
      height: 30,
      top: 0,
      left: 0,
      bottom: 30,
      right: 300,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const calls: string[] = [];
    const mockCtx = {
      clearRect: () => calls.push('clearRect'),
      beginPath: () => calls.push('beginPath'),
      moveTo: () => calls.push('moveTo'),
      lineTo: () => calls.push('lineTo'),
      bezierCurveTo: () => calls.push('bezierCurveTo'),
      closePath: () => calls.push('closePath'),
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      rect: () => calls.push('rect'),
      clip: () => calls.push('clip'),
      fill: () => calls.push('fill'),
      stroke: () => calls.push('stroke'),
      createLinearGradient: () => ({ addColorStop: () => {} }),
    } as unknown as CanvasRenderingContext2D;
    canvas.getContext = ((() => mockCtx) as unknown) as typeof canvas.getContext;

    const heatmap = new TimelineHeatmap(canvas);
    // set bins directly by calling sync with player events
    const events = [
      { start: 0, end: 5 },
    ] as unknown as AssEvent[];
    void heatmap.sync(null, {
      transport: { duration: 10, time: 2 },
      par: { script: { events } },
    } as unknown as import('../site/src/player/player').Player);

    heatmap.setTime(2.5, 10);
    expect(calls).toContain('clearRect');
    expect(calls).toContain('bezierCurveTo');
    expect(calls).toContain('clip');
    expect(calls).toContain('fill');

    heatmap.clear();
    heatmap.destroy();
  });
});
