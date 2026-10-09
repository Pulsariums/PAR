import { describe, expect, it } from 'vitest';

import { isSoftwareGpu } from '../site/src/studio/perf/env';
import { Recorder, type FrameSample } from '../site/src/studio/perf/recorder';
import { buildReport, pct, REPORT_SCHEMA, summaryText, worstFrames } from '../site/src/studio/perf/report';
import { busiest } from '../site/src/studio/perf/scan';
import type { AssEvent } from '../src/types/script';

const frame = (i: number, over: Partial<FrameSample> = {}): FrameSample => ({
  at: Math.round(i * 16.7), gap: 16.7, media: 10 + (i * 16.7) / 1000, lines: 100, drawn: 90, fillMpx: 0.9, shed: 0, misses: 0, skipped: 0, dropped: 0, drawP50: 3, drawP95: 5, ...over,
});
const env = { userAgent: 'UA/1', platform: 'Linux', cores: 8, memoryGB: 8, dpr: 1, screen: '1920x1080', viewport: '1200x800', gpu: 'ANGLE (test)', softwareGpu: false, longTasks: true };
const setup = { parVersion: '0.1.0', renderMode: 'auto', fps: 'auto', videoFps: 24, layout: '1920x1080 (script)', region: '1200x675', hasVideo: true };
const run = (frames: FrameSample[], over = {}) => ({ frames, longTasks: [{ at: 500, dur: 90 }, { at: 900, dur: 140 }], durationMs: 10000, startMedia: 10, endMedia: 20, playing: true, seeks: 0, heapStartMB: 40, heapEndMB: 55, ...over });

describe('report', () => {
  it('percentiles are nearest-rank and empty input is 0', () => {
    expect(pct([], 0.5)).toBe(0);
    expect(pct([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(pct([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
  });

  it('counts late frames, long tasks and counter differences', () => {
    const fs = Array.from({ length: 600 }, (_, i) => frame(i, { misses: i * 2, gap: i === 100 ? 120 : i === 300 ? 60 : i === 400 ? 40 : 16.7 }));
    const r = buildReport(run(fs), env, setup, { kind: 'par', bytes: 2191171, events: 112847, durationS: 1416 });
    expect(r.schema).toBe(REPORT_SCHEMA);
    expect(r.frames.count).toBe(600);
    expect(r.frames.over33).toBe(3);
    expect(r.frames.over50).toBe(2);
    expect(r.frames.over100).toBe(1);
    expect(r.frames.gap.max).toBe(120);
    expect(r.frames.longTasks).toEqual({ supported: true, count: 2, totalMs: 230, maxMs: 140 });
    expect(r.render.spriteMisses).toBe(1198);
    expect(r.frames.fpsAvg).toBeGreaterThan(55);
    expect(r.seconds.length).toBeGreaterThanOrEqual(9);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('a counter that resets (cache cleared) does not produce negative differences', () => {
    const fs = [frame(0, { misses: 50 }), frame(1, { misses: 60 }), frame(2, { misses: 3 }), frame(3, { misses: 9 })];
    expect(buildReport(run(fs), env, setup, null).render.spriteMisses).toBe(16);
  });

  it('keeps the worst frames apart: one stutter is one entry', () => {
    const fs = Array.from({ length: 300 }, (_, i) => frame(i));
    fs[100] = { ...fs[100], gap: 90 };
    fs[101] = { ...fs[101], gap: 80 };
    fs[102] = { ...fs[102], gap: 70 };
    fs[200] = { ...fs[200], gap: 60 };
    const w = worstFrames(fs, 5);
    expect(w[0].gap).toBe(90);
    expect(w.map((x) => x.gap).slice(0, 2)).toEqual([90, 60]);
    expect(w.filter((x) => Math.abs(x.at - fs[100].at) < 300)).toHaveLength(1);
  });

  it('the summary names the run and carries no file name or subtitle text', () => {
    const fs = Array.from({ length: 100 }, (_, i) => frame(i));
    const text = summaryText(buildReport(run(fs), env, setup, { kind: 'par', bytes: 1234, events: 5, durationS: 61 }));
    expect(text).toContain('par-perf/1');
    expect(text).toContain('GPU: ANGLE (test)');
    expect(text).toContain('PAR, 1,234 B, 5 events, 1:01');
    expect(text).toContain('Frame gap ms');
    expect(text.split('\n').length).toBeLessThan(16);
    expect(buildReport(run(fs), { ...env, longTasks: false }, setup, null).frames.longTasks.supported).toBe(false);
    expect(summaryText(buildReport(run(fs), { ...env, longTasks: false }, setup, null))).toContain('not measured by this browser');
  });

  it('flags a software rasteriser in the summary', () => {
    expect(isSoftwareGpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe(true);
    expect(isSoftwareGpu('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)')).toBe(false);
    expect(isSoftwareGpu(null)).toBe(false);
    const fs = Array.from({ length: 20 }, (_, i) => frame(i));
    expect(summaryText(buildReport(run(fs), { ...env, softwareGpu: true }, setup, null))).toContain('[SOFTWARE rendering]');
  });

  it('keeps logger detail bounded, text-free, and separates timing domains', () => {
    const fs = [
      frame(0, { at: 0, lines: 180, diagnostics: {
        serial: 1, observedAt: 100, media: 1, presented: true, held: false, sceneMs: 8, renderMs: 9, domMs: 2, canvasMs: 3, eventCount: 180,
        canvas: { drawImages: 1, drawOps: 2, stateChanges: 1, spriteLookups: 2, spriteHits: 1, spriteMisses: 1, jsMs: 4, signature: 'x' },
        candidates: [{ id: 'event-1', index: 1, start: 0, end: 2, path: 'canvas', style: 'Default' }],
      }, render: { domLines: 20, canvasLines: 160, spriteHits: 1, spriteMisses: 2, workers: 1, workerBuilt: 1, planQueued: 0, planLeadMs: 1, pending: 0, readyMs: 0, deficitMs: 0, buildRate: 1, missing: 0, missedTotal: 0, held: 0, compositeMs: 5, stalls: 0, stallMs: 0, evictions: 0 }, source: { windowEvents: 2, loading: false, bytesRead: 1, decodeMs: 6, indexMs: 1 },
      }),
      frame(800, { at: 800, lines: 160, gap: 800, diagnostics: { serial: 2, observedAt: 800, media: 2, presented: true, held: false, sceneMs: 10, renderMs: 11, domMs: 3, canvasMs: 4, eventCount: 160 } }),
    ];
    const r = buildReport(run(fs, {
      lineEvents: [{ at: 100, media: 1, mediaTime: 1, sessionId: 2, generation: 3, epoch: 4, id: 'event-1', index: 1, start: 100, end: 102, path: 'canvas', outcome: 'rendered' }],
      videoFrames: [{ at: 0, media: 1 }, { at: 40, media: 1.04 }],
    }), env, setup, null);
    expect(r.logger.schema).toBe('par-logger/1');
    expect(r.logger.lineEvents.records).toEqual([expect.objectContaining({ id: 'event-1', path: 'canvas' })]);
    expect(JSON.stringify(r.logger)).not.toContain('subtitle text');
    expect(r.logger.video).toMatchObject({ available: true, fps: 25, frames: 2 });
    expect(r.logger.denseScenes[0]).toMatchObject({ peakLines: 180, frames: 2 });
    expect(r.logger.timeline[0]).toMatchObject({ renderMsP95: 11, sourceMsP95: 6, canvasMsP95: 4, compositeMsP95: 5, jsMsP95: 4 });
  });

  it('marks video presentation unavailable without VFC metadata', () => {
    const r = buildReport(run([frame(0)]), env, setup, null);
    expect(r.logger.video).toMatchObject({ available: false, fps: null, frames: 0 });
    expect(r.logger.limitations).toContain('video presentation metadata unavailable');
  });

  it('an empty run still builds a report', () => {
    const r = buildReport(run([]), env, setup, null);
    expect(r.frames.count).toBe(0);
    expect(r.frames.fpsAvg).toBe(0);
    expect(r.worst).toEqual([]);
  });
});

describe('Recorder', () => {
  it('skips the first frame (no previous one), measures gaps and notices seeks and pauses', () => {
    let media = 10;
    let playing = true;
    const rec = new Recorder(() => ({ media, lines: 1, drawn: 1, fillMpx: 0, shed: 0, misses: 0, skipped: 0, dropped: 0, drawP50: 0, drawP95: 0, playing, heapMB: 50 }));
    rec.add(1000);
    media = 10.02; rec.add(1016.7);
    media = 10.04; rec.add(1033.4);
    media = 40; rec.add(1100); // jumped
    playing = false; media = 40.02; rec.add(1116.7);
    const r = rec.stop(1200);
    expect(r.frames.map((f) => f.gap)).toEqual([16.7, 16.7, 66.6, 16.7]);
    expect(r.seeks).toBe(1);
    expect(r.playing).toBe(false);
    expect(r.startMedia).toBe(10);
    expect(r.endMedia).toBe(40.02);
    expect(r.heapStartMB).toBe(50);
  });
});

describe('busiest moments', () => {
  const ev = (start: number, end: number): AssEvent => ({ start, end } as unknown as AssEvent);
  const events = [...Array.from({ length: 40 }, () => ev(52.5, 53.5)), ...Array.from({ length: 25 }, () => ev(9.0, 9.4)), ev(0, 100)];
  const source = {
    duration: 100,
    readWindow: async (a: number, b: number) => events.filter((e) => e.start < b && e.end > a),
  } as never;

  it('returns the heaviest instants, busiest first, not two from the same stretch', async () => {
    const m = await busiest(source, 3);
    expect(m[0].lines).toBe(41);
    expect(m[0].t).toBeGreaterThanOrEqual(52);
    expect(m[0].t).toBeLessThan(54);
    expect(m[1].t).toBeGreaterThanOrEqual(8);
    expect(m[1].t).toBeLessThan(10);
    expect(Math.abs(m[0].t - m[1].t)).toBeGreaterThanOrEqual(10);
  });

  it('stops when aborted', async () => {
    const ac = new AbortController();
    let reads = 0;
    const slow = { duration: 400, readWindow: async () => { reads++; if (reads === 3) ac.abort(); return []; } } as never;
    await busiest(slow, 3, { signal: ac.signal });
    expect(reads).toBe(3);
  });
});
