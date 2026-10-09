import { afterEach, describe, expect, it, vi } from 'vitest';

import { RenderLogger, type RenderMarker } from '../src/core/Diagnostics';
import { Scheduler } from '../src/clock/Scheduler';

const marker = (epoch: number, index = 0) => ({
  id: String(index), index, mediaTime: 1.25, generation: 7, epoch, path: 'dom' as const,
  start: 10, end: 11, outcome: 'rendered' as const,
});

afterEach(() => vi.restoreAllMocks());

describe('core event logger', () => {
  it('does not call a sink or allocate markers while disabled', () => {
    const sink = vi.fn();
    const logger = new RenderLogger();
    logger.mark(marker(1));
    expect(logger.enabled).toBe(false);
    expect(sink).not.toHaveBeenCalled();
    expect(logger.snapshot()).toMatchObject({ markers: [], dropped: 0 });
  });

  it('bounds aggregate markers and per-frame markers', () => {
    const logger = new RenderLogger();
    logger.setSink(vi.fn<(marker: RenderMarker) => void>());
    for (let i = 0; i < 301; i++) logger.mark(marker(1, i));
    expect(logger.snapshot().markers).toHaveLength(64);
    expect(logger.snapshot().dropped).toBe(237);
    for (let i = 0; i < 301; i++) logger.mark(marker(i + 2, i));
    expect(logger.snapshot().markers).toHaveLength(300);
    expect(logger.snapshot().dropped).toBe(302);
  });

  it('preserves cumulative drops while resetting segment markers and frame limits', () => {
    const logger = new RenderLogger();
    const sink = vi.fn();
    logger.setSink(sink);
    for (let i = 0; i < 320; i++) logger.mark(marker(1, i));
    expect(logger.snapshot()).toMatchObject({ dropped: 256 });
    const firstSession = logger.snapshot().sessionId;
    logger.segment();
    logger.segment();
    expect(logger.snapshot()).toMatchObject({ markers: [], dropped: 256 });
    for (let i = 0; i < 320; i++) logger.mark(marker(1, i));
    expect(logger.snapshot().markers).toHaveLength(64);
    expect(logger.snapshot().dropped).toBe(512);
    expect(logger.snapshot().sessionId).toBeGreaterThan(firstSession);
    expect(sink).toHaveBeenCalledTimes(128);
    logger.clear();
    expect(logger.snapshot()).toMatchObject({ markers: [], dropped: 0 });
    logger.mark(marker(1));
    logger.setSink(null);
    expect(logger.enabled).toBe(false);
    expect(logger.snapshot()).toMatchObject({ markers: [], dropped: 0 });
  });

  it('keeps identity and starts a new session on invalidation', () => {
    const logger = new RenderLogger();
    const seen: unknown[] = [];
    logger.setSink((m) => seen.push(m));
    logger.mark(marker(1, 4));
    const first = logger.snapshot();
    logger.segment();
    logger.mark(marker(2, 9));
    const second = logger.snapshot();
    expect(seen).toHaveLength(2);
    expect(first.markers[0]).toMatchObject({ sessionId: first.sessionId, id: '4', index: 4, epoch: 1, outcome: 'rendered' });
    expect(second.sessionId).toBeGreaterThan(first.sessionId);
    expect(second.markers).toHaveLength(1);
    expect(second.markers[0]).toMatchObject({ sessionId: second.sessionId, id: '9', index: 9 });
  });
});

describe('scheduler video metadata', () => {
  it('captures supported metadata and safely falls back when optional fields are absent', () => {
    type MockCallback = (now: number, meta: { mediaTime: number; expectedDisplayTime?: number }) => void;
    const callbacks: MockCallback[] = [];
    const video = document.createElement('video') as unknown as HTMLVideoElement & {
      requestVideoFrameCallback: (cb: MockCallback) => number;
      cancelVideoFrameCallback: (id: number) => void;
    };
    video.requestVideoFrameCallback = ((cb: MockCallback) => { callbacks.push(cb); return callbacks.length; }) as typeof video.requestVideoFrameCallback;
    video.cancelVideoFrameCallback = vi.fn();
    const received: Array<{ time: number | null; meta?: { now: number; mediaTime: number; expectedDisplayTime?: number } }> = [];
    const scheduler = new Scheduler((time, meta) => received.push({ time, meta }));
    scheduler.setMetadataCapture(true);
    scheduler.configure('auto', video);
    scheduler.start();
    callbacks[0]!(12, { mediaTime: 3.5 });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ time: 3.5, meta: { now: 12, mediaTime: 3.5 } });
    scheduler.stop();
  });
});
