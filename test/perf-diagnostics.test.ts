import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildReport, pct } from '../site/src/studio/perf/report';
import { MAX_LINE_EVENTS, MAX_LONG_TASKS, MAX_TASK_ATTRIBUTIONS, MAX_RUN_MS, MAX_VIDEO_FRAMES, Recorder, type FrameSample, type RawRun, type VideoFrameSource } from '../site/src/studio/perf/recorder';
import { initPerf, PERF_HTML } from '../site/src/studio/perf/ui';
import type { Player } from '../site/src/player/player';
import { Player as StudioPlayer } from '../site/src/player/player';
import { initStudio } from '../site/src/studio';
import { requestView } from '../site/src/view';
import { copyText } from '../site/src/player/snippet';
import { t } from '../site/src/i18n/i18n';

vi.mock('../site/src/player/snippet', async (importOriginal) => ({
  ...await importOriginal<typeof import('../site/src/player/snippet')>(),
  copyText: vi.fn(async () => true),
}));
import type { StudioSession } from '../site/src/studio/session';
import { RenderLogger, type RenderMarker } from '../src/core/Diagnostics';
import { create, PARRenderer } from '../src/index';

const env = {
  userAgent: 'UA/1',
  platform: 'Linux',
  cores: 8,
  memoryGB: 8,
  dpr: 1,
  screen: '1920x1080',
  viewport: '1200x800',
  gpu: 'ANGLE (test)',
  softwareGpu: false,
  longTasks: true,
};

const setup = (over: Partial<{ fps: string; videoFps: number | null }> = {}) => ({
  parVersion: '0.1.0',
  renderMode: 'auto',
  fps: '60',
  videoFps: null,
  layout: '1920x1080 (script)',
  region: '1200x675',
  hasVideo: true,
  ...over,
});

const frame = (at: number, gap: number, over: Partial<FrameSample> = {}): FrameSample => ({
  at,
  gap,
  media: at / 1000,
  lines: 10,
  drawn: 10,
  fillMpx: 0,
  shed: 0,
  misses: 0,
  skipped: 0,
  dropped: 0,
  drawP50: 1,
  drawP95: 1,
  ...over,
});

const run = (frames: FrameSample[], over: Partial<RawRun> = {}): RawRun => ({
  frames,
  longTasks: [],
  durationMs: 1000,
  startMedia: 0,
  endMedia: 1,
  playing: true,
  seeks: 0,
  heapStartMB: 10,
  heapEndMB: 11,
  ...over,
});

describe('performance diagnostics', () => {
  it('uses render/display FPS for the frame budget, independently of video FPS', () => {
    const report = buildReport(
      run([frame(100, 30)]),
      env,
      setup({ fps: '60', videoFps: 24 }),
      null,
    );

    expect(report.diagnostics.budgetMs).toBeCloseTo(1000 / 60, 1);
    expect(report.diagnostics.hotspotCount).toBe(1);
  });

  it('unions long-task overlap instead of counting one task once per overlapping frame', () => {
    const report = buildReport(
      run(
        [frame(200, 100), frame(250, 100)],
        { longTasks: [{ at: 120, dur: 110 }] },
      ),
      env,
      setup(),
      null,
    );

    expect(report.diagnostics.longTaskOverlapMs).toBe(110);
    expect(report.diagnostics.hotspots[0]?.evidence.longTaskMs).toBe(110);
  });

  it('breaks a hotspot when a seek jumps media time, and records pause coverage as a limitation', () => {
    const report = buildReport(
      run(
        [frame(100, 40, { media: 1 }), frame(150, 40, { media: 20 })],
        { playing: false, seeks: 1 },
      ),
      env,
      setup(),
      null,
    );

    expect(report.diagnostics.hotspotCount).toBe(2);
    expect(report.diagnostics.limitations).toContain('run includes a pause');
  });

  it('does not claim a cause when render and source evidence are unavailable', () => {
    const report = buildReport(run([frame(100, 40)]), env, setup(), null);
    const hotspot = report.diagnostics.hotspots[0]!;

    expect(report.diagnostics.limitations).toEqual(expect.arrayContaining([
      'renderer samples unavailable',
      'source samples unavailable',
    ]));
    expect(hotspot.cause).toBe('scheduler/unknown');
    expect(hotspot.confidence).toBe('low');
  });

  it('reports high confidence only when one measured signal dominates', () => {
    const report = buildReport(
      run(
        [frame(100, 40)],
        { longTasks: [{ at: 60, dur: 40 }] },
      ),
      env,
      setup(),
      null,
    );

    expect(report.diagnostics.hotspots[0]).toMatchObject({
      cause: 'main-thread/unknown',
      confidence: 'high',
    });
  });

  it('never attributes huge blank-frame gaps to stale canvas counters, and separates blank groups', () => {
    const diag = { serial: 1, observedAt: 7000, media: 13.71, presented: true, held: false, sceneMs: 1, renderMs: 1, domMs: null, canvasMs: null, eventCount: 0 };
    const blank = frame(7000, 6551, { lines: 0, drawn: 0, fillMpx: 9000, diagnostics: diag });
    const report = buildReport(run([blank], { longTasks: [{ at: 500, dur: 6000 }] }), env, { ...setup(), hasVideo: false }, null);
    expect(report.diagnostics.hotspots[0]!.cause).toBe('main-thread/unknown');
    expect(report.logger.causes.some((c) => c.cause.startsWith('canvas'))).toBe(false);
    expect(report.logger.video.available).toBe(false);
    expect(report.logger.limitations).toContain('no video: presentation unavailable');
    const unknown = buildReport(run([blank]), env, setup(), null);
    expect(unknown.diagnostics.hotspots[0]!.cause).toBe('scheduler/unknown');
    const prepared = buildReport(run([{ ...blank, diagnostics: { ...diag, prepareMs: 5000, sourceUpdateMs: 4800, relayoutMs: 150, sourceReady: false, rendererSubmitted: false } }]), env, setup(), null);
    expect(prepared.diagnostics.hotspots[0]).toMatchObject({ cause: 'main-thread/pre-render', evidence: { prepareMs: 5000, sourceUpdateMs: 4800, sourceReady: false, rendererSubmitted: false } });
    expect(prepared.logger.timeline[0]).toMatchObject({ prepareMsP95: 5000, sourceUpdateMsP95: 4800, sourceNotReadyFrames: 1, rendererSubmittedFrames: 0 });
    const mixed = buildReport(run([blank, frame(7050, 50, { fillMpx: 100 })]), env, setup(), null);
    expect(mixed.diagnostics.hotspots).toHaveLength(2);
    expect(mixed.diagnostics.hotspots[0]!.cause).not.toContain('canvas');
  });

  it('distinguishes measured scene/canvas work from window arrival preparation', () => {
    const diag = { serial: 1, observedAt: 100, media: 1, presented: true, held: false, prepareMs: 1, sceneMs: 80, renderMs: 80, domMs: null, canvasMs: 75, eventCount: 10 };
    expect(buildReport(run([frame(100, 90, { diagnostics: diag })]), env, setup(), null).diagnostics.hotspots[0]!.cause).toBe('canvas/scene');
    expect(buildReport(run([frame(100, 90, { lines: 0, drawn: 0, windowPrepareMs: 200 })]), env, setup(), null).diagnostics.hotspots[0]!.cause).toBe('main-thread/pre-render');
  });

  it('keeps empty diagnostics inputs finite and empty', () => {
    const report = buildReport(run([]), env, setup(), null);

    expect(pct([], 0.5)).toBe(0);
    expect(report.diagnostics.hotspotCount).toBe(0);
    expect(report.diagnostics.hotspots).toEqual([]);
    expect(report.frames.gap).toEqual({ p50: 0, p90: 0, p95: 0, p99: 0, max: 0 });
  });

  it('uses nearest-rank percentile semantics at the even-sample median', () => {
    expect(pct([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBe(5);
  });
});

const submission = (index = 0): Omit<RenderMarker, 'sessionId'> => ({
  id: String(index), index, mediaTime: 1.5, generation: index + 1, epoch: index + 1,
  path: 'dom', start: 1010, end: 1012, outcome: 'rendered',
});

const sample = () => ({
  media: 1.5, lines: 1, drawn: 1, fillMpx: 0, shed: 0, misses: 0, skipped: 0, dropped: 0,
  drawP50: 0, drawP95: 0, playing: true, heapMB: null,
});

const loggerSource = () => {
  const logger = new RenderLogger();
  return {
    logger,
    setEventLogger: vi.fn((sink: Parameters<RenderLogger['setSink']>[0]) => logger.setSink(sink)),
    getEventLog: vi.fn(() => logger.snapshot()),
  };
};

describe('logger recorder integration', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('attaches one sink, retains actual submissions across segments, and never duplicates candidates or snapshots', () => {
    const source = loggerSource();
    const recorder = new Recorder(() => ({ ...sample(), diagnostics: {
      serial: 1, observedAt: 1000, media: 1.5, presented: true, held: false,
      sceneMs: 0, renderMs: 0, domMs: 0, canvasMs: null, eventCount: 1,
      candidates: [{ id: 'candidate-only', index: 99, start: 1, end: 2, path: 'dom', style: 'Default' }],
    } }), null, source);
    expect(source.setEventLogger).not.toHaveBeenCalled();
    recorder.start(1000);
    recorder.start(1001);
    expect(source.setEventLogger).toHaveBeenCalledTimes(1);
    source.logger.mark(submission());
    source.logger.segment();
    source.logger.mark({ ...submission(1), path: 'canvas', outcome: 'held' });
    recorder.add(1000);
    recorder.add(1016);
    recorder.add(1032);
    const result = recorder.stop(1040);
    expect(source.getEventLog).toHaveBeenCalledTimes(1);
    expect(source.setEventLogger.mock.calls.map(([sink]) => sink === null)).toEqual([false, true]);
    expect(source.getEventLog.mock.invocationCallOrder[0]).toBeLessThan(source.setEventLogger.mock.invocationCallOrder[1]!);
    expect(result.lineEvents).toHaveLength(2);
    expect(result.lineEvents?.[0]).toMatchObject({ at: 10, media: 1.5, generation: 1, epoch: 1, outcome: 'rendered' });
    expect(result.lineEvents?.[1]).toMatchObject({ path: 'canvas', outcome: 'held' });
    expect(result.lineEvents?.[0]?.sessionId).not.toBe(result.lineEvents?.[1]?.sessionId);
    expect(JSON.stringify(result.lineEvents)).not.toContain('candidate-only');
    expect(source.logger.enabled).toBe(false);
    source.logger.mark(submission(2));
    recorder.stop(1050);
    expect(result.lineEvents).toHaveLength(2);
    expect(source.getEventLog).toHaveBeenCalledTimes(1);
    recorder.start(2000);
    source.logger.mark(submission(3));
    expect(recorder.stop(2020).lineEvents).toHaveLength(1);
    recorder.clear();
    expect(recorder.stop(2030).lineEvents).toEqual([]);
    expect(source.logger.snapshot().markers).toEqual([]);
  });

  it('caps records across core segments and strips unrecognized fields from the sink and report', () => {
    const source = loggerSource();
    const recorder = new Recorder(sample, null, source);
    recorder.start(1000);
    for (let i = 0; i < MAX_LINE_EVENTS + 10; i++) {
      if (i % 100 === 0) source.logger.segment();
      source.logger.mark({ ...submission(i), text: 'private subtitle text' } as Omit<RenderMarker, 'sessionId'>);
    }
    const result = recorder.stop(1100);
    expect(result.lineEvents).toHaveLength(MAX_LINE_EVENTS);
    expect(result.lineEventsDropped).toBe(10);
    const report = buildReport(result, env, setup(), null);
    expect(report.logger.lineEvents).toMatchObject({ count: MAX_LINE_EVENTS, capped: true, dropped: 10 });
    expect(JSON.stringify(report)).not.toContain('private subtitle text');
    const untrusted = { ...result.lineEvents![0]!, text: 'private subtitle text' };
    const oversized = buildReport({ ...result, lineEvents: [untrusted, ...result.lineEvents!] }, env, setup(), null);
    expect(oversized.logger.lineEvents).toMatchObject({ count: MAX_LINE_EVENTS, dropped: 11 });
    expect(JSON.stringify(oversized)).not.toContain('private subtitle text');
  });

  it('accumulates core drops across segments and reports 320-event scenes as capped', () => {
    const source = loggerSource();
    const recorder = new Recorder(sample, null, source);
    recorder.start(1000);
    for (let i = 0; i < 320; i++) source.logger.mark(submission(i));
    source.logger.segment();
    source.logger.segment();
    expect(source.getEventLog().dropped).toBe(20);
    for (let i = 0; i < 320; i++) source.logger.mark({ ...submission(i), epoch: 400 });
    source.logger.segment();
    const result = recorder.stop(1100);
    expect(result.lineEvents).toHaveLength(364);
    expect(result.lineEventsDropped).toBe(276);
    expect(buildReport(result, env, setup(), null).logger.lineEvents).toMatchObject({ count: 364, capped: true, dropped: 276 });
    expect(recorder.stop(1200).lineEventsDropped).toBe(276);
    recorder.start(2000);
    expect(recorder.stop(2100).lineEventsDropped).toBe(0);
  });

  it('preserves renderer drops when replacing a 320-event source with an empty source', () => {
    const subtitle = [
      '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 640', 'PlayResY: 360',
      '[V4+ Styles]', 'Format: Name, Fontname, Fontsize', 'Style: Default,Arial,24',
      '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      ...Array.from({ length: 320 }, (_, i) => `Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,line ${i}`),
    ].join('\n');
    const par = create({ container: document.createElement('div'), subtitle, renderMode: 'dom' });
    try {
      const recorder = new Recorder(sample, null, par);
      recorder.start(1000);
      par.renderAt(1.5);
      par.setSubtitle(null);
      expect(par.getEventLog()).toMatchObject({ markers: [], dropped: 256 });
      expect(buildReport(recorder.stop(1100), env, setup(), null).logger.lineEvents).toMatchObject({ count: 64, capped: true, dropped: 256 });
    } finally { par.destroy(); }
  });

  it('reports core truncation even when fewer than the recorder cap were delivered', () => {
    const source = loggerSource();
    const recorder = new Recorder(sample, null, source);
    recorder.start(1000);
    for (let i = 0; i < 310; i++) source.logger.mark(submission(i));
    const report = buildReport(recorder.stop(1100), env, setup(), null);
    expect(report.logger.lineEvents).toMatchObject({ count: 300, capped: true, dropped: 10 });
  });

  it('keeps optional video records bounded and cancels handle zero without accepting callbacks from an old run', () => {
    const callbacks: Array<Parameters<NonNullable<VideoFrameSource['requestVideoFrameCallback']>>[0]> = [];
    const video: VideoFrameSource = {
      requestVideoFrameCallback: vi.fn((cb) => { callbacks.push(cb); return 0; }),
      cancelVideoFrameCallback: vi.fn(),
    };
    const recorder = new Recorder(sample, video);
    recorder.start(1000);
    callbacks[0]!(1010, { mediaTime: 1.5 });
    callbacks[1]!(1050, { mediaTime: 1.54, presentedFrames: 2, expectedDisplayTime: 1051, processingDuration: 0.002 });
    const first = recorder.stop(1100);
    expect(first.videoFrames).toEqual([
      { at: 10, media: 1.5 },
      { at: 50, media: 1.54, presentedFrames: 2, expectedDisplayTime: 1051, processingDuration: 0.002 },
    ]);
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(0);
    const stale = callbacks[2]!;
    recorder.start(2000);
    stale(2010, { mediaTime: 99 });
    expect(callbacks).toHaveLength(4);
    for (let i = 0; i < MAX_VIDEO_FRAMES + 1; i++) callbacks[callbacks.length - 1]!(2000 + i, { mediaTime: i / 25 });
    expect(recorder.stop(40000).videoFrames).toHaveLength(MAX_VIDEO_FRAMES);
    expect(buildReport(first, env, setup(), null).logger.video).toMatchObject({ available: true, fps: 25, frames: 2 });
  });

  it('releases frame and observer callbacks and ignores stale callbacks after restart', () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => { callbacks.push(cb); return 0; }));
    const observers: Array<{ callback: PerformanceObserverCallback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal('PerformanceObserver', class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(readonly callback: PerformanceObserverCallback) { observers.push(this); }
    });
    const read = vi.fn(sample);
    const recorder = new Recorder(read);
    recorder.start(1000);
    expect(recorder.longTasksSupported).toBe(true);
    recorder.stop(1100);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(0);
    expect(observers[0]!.disconnect).toHaveBeenCalledTimes(1);
    expect(recorder.longTasksSupported).toBe(true);
    recorder.start(2000);
    const list = { getEntries: () => [{ startTime: 2010, duration: 20 }] } as unknown as PerformanceObserverEntryList;
    callbacks[0]!(2010);
    observers[0]!.callback(list, observers[0] as unknown as PerformanceObserver);
    expect(read).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(2);
    callbacks[1]!(2016);
    observers[1]!.callback(list, observers[1] as unknown as PerformanceObserver);
    expect(read).toHaveBeenCalledTimes(1);
    const result = recorder.stop(2100);
    expect(result.longTasks).toEqual([{ at: 10, dur: 20 }]);
    callbacks[2]!(2120);
    observers[1]!.callback(list, observers[1] as unknown as PerformanceObserver);
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.longTasks).toHaveLength(1);
    expect(observers[1]!.disconnect).toHaveBeenCalledTimes(1);
    recorder.stop(2200);
    expect(observers[1]!.disconnect).toHaveBeenCalledTimes(1);
  });

  it('caps long tasks and attribution, strips private metadata, and reports unsupported attribution', () => {
    let callback!: PerformanceObserverCallback;
    vi.stubGlobal('PerformanceObserver', class {
      constructor(cb: PerformanceObserverCallback) { callback = cb; }
      observe = vi.fn(); disconnect = vi.fn();
    });
    const recorder = new Recorder(sample);
    recorder.start(1000);
    const attribution = Array.from({ length: 9 }, (_, i) => ({ name: i ? 'private subtitle text' : 'unknown', containerType: 'iframe', containerName: 'private subtitle text', containerId: 'private subtitle text', containerSrc: 'https://private.example', text: 'private subtitle text' }));
    const list = { getEntries: () => Array.from({ length: MAX_LONG_TASKS + 3 }, () => ({ startTime: 1010, duration: 60, attribution })) } as unknown as PerformanceObserverEntryList;
    callback(list, {} as PerformanceObserver);
    const result = recorder.stop(1100);
    expect(result.longTasks).toHaveLength(MAX_LONG_TASKS);
    expect(result.longTasksDropped).toBe(3);
    expect(result.longTasks[0]!.attribution).toHaveLength(MAX_TASK_ATTRIBUTIONS);
    expect(result.longTasks[0]!.attributionDropped).toBe(5);
    const report = buildReport(result, env, setup(), null);
    expect(report.logger.longTasks).toMatchObject({ attributionAvailable: true, capped: true, dropped: 3 });
    expect(report.logger.longTasks.records[0]!.attribution![0]).toEqual({ name: 'unknown', containerType: 'iframe' });
    expect(JSON.stringify(report)).not.toContain('private');
    const dirty = { ...result, longTasks: [{ at: 0, dur: 50, attribution }] };
    expect(JSON.stringify(buildReport(dirty, env, setup(), null))).not.toContain('private');
    recorder.start(2000);
    callback({ getEntries: () => [{ startTime: 2010, duration: 60 }] } as unknown as PerformanceObserverEntryList, {} as PerformanceObserver);
    const fallback = buildReport(recorder.stop(2100), env, setup(), null);
    expect(fallback.frames.longTasks.count).toBe(1);
    expect(fallback.logger.longTasks.attributionAvailable).toBe(false);
    expect(fallback.logger.limitations).toContain('longtask attribution unavailable');
  });

  it('captures cumulative source-arrival work once per sample and handles resets', () => {
    let total = 100;
    const recorder = new Recorder(() => ({ ...sample(), source: { windowEvents: 0, loading: true, bytesRead: 0, decodeMs: 0, indexMs: 0, windowPrepareTotalMs: total }, diagnostics: { serial: 1, observedAt: 1000, media: 1.5, presented: true, held: false, sceneMs: 0, renderMs: 0, domMs: 0, canvasMs: null, eventCount: 1, windowPrepareTotalMs: 0 } }));
    recorder.start(1000);
    recorder.add(1010);
    total = 125; recorder.add(1020); recorder.add(1030);
    total = 0; recorder.add(1040);
    total = 50; recorder.add(1050);
    expect(recorder.stop(1100).frames.map((f) => f.windowPrepareMs)).toEqual([125, 0, 0, 50]);
  });

  it('drains queued long tasks on stop before disconnecting', () => {
    const takeRecords = vi.fn(() => [{ startTime: 1010, duration: 70 }] as PerformanceEntry[]);
    vi.stubGlobal('PerformanceObserver', class { observe = vi.fn(); disconnect = vi.fn(); takeRecords = takeRecords; });
    const recorder = new Recorder(sample);
    recorder.start(1000);
    expect(recorder.stop(1100).longTasks).toEqual([{ at: 10, dur: 70 }]);
    recorder.stop(1200);
    expect(takeRecords).toHaveBeenCalledTimes(1);
  });

  it('detaches the sink and cancels video capture at the maximum run duration', () => {
    let tick: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { tick = cb; return 1; });
    const source = loggerSource();
    const video = { requestVideoFrameCallback: vi.fn(() => 0), cancelVideoFrameCallback: vi.fn() };
    const recorder = new Recorder(sample, video, source);
    recorder.start(1000);
    tick!(1000 + MAX_RUN_MS);
    expect(recorder.active).toBe(false);
    expect(source.logger.enabled).toBe(false);
    expect(source.getEventLog).toHaveBeenCalledTimes(1);
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(0);
  });
});

describe('logger UI integration', () => {
  let par: ReturnType<typeof create>;
  let now: number;
  let tick: FrameRequestCallback | undefined;
  let player: Player;
  let perf: ReturnType<typeof initPerf>;
  let currentSession: StudioSession | null;

  const click = (id: string) => document.getElementById(id)!.click();
  const recordFrames = () => {
    for (let i = 0; i < 7; i++) {
      now += 16;
      par.renderAt(1.1 + i / 100);
      tick!(now);
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { tick = cb; return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    document.body.innerHTML = PERF_HTML;
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 640 });
    Object.defineProperty(container, 'clientHeight', { value: 360 });
    document.body.append(container);
    par = create({ container, subtitle: [
      '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 640', 'PlayResY: 360',
      '[V4+ Styles]', 'Format: Name, Fontname, Fontsize', 'Style: Default,Arial,24',
      '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,private subtitle text',
    ].join('\n'), renderMode: 'dom' });
    const transport = { playing: false, play: vi.fn(() => { transport.playing = true; }), pause: vi.fn(() => { transport.playing = false; }), seek: vi.fn() };
    player = { par, video: document.createElement('video'), hasVideo: false, transport } as unknown as Player;
    currentSession = null;
    perf = initPerf({ player, session: () => currentSession, choices: () => ({ renderMode: 'dom', fps: 'auto', videoFps: null }) });
  });
  afterEach(() => {
    par.destroy();
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('leaves Watch idle, enables actual logging before play, and disables and clears it on finish/clear', () => {
    const metrics = vi.spyOn(par, 'getMetrics');
    const diagnostics = vi.spyOn(par, 'getDiagnostics');
    const setLogger = vi.spyOn(par, 'setEventLogger');
    const getLog = vi.spyOn(par, 'getEventLog');
    par.renderAt(1.01);
    expect(metrics).not.toHaveBeenCalled();
    expect(diagnostics).not.toHaveBeenCalled();
    expect(par.getEventLog().markers).toEqual([]);
    getLog.mockClear();
    click('stPerfRec');
    click('stPerfRec');
    expect(setLogger).toHaveBeenCalledTimes(1);
    expect(setLogger.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(player.transport.play).mock.invocationCallOrder[0]!);
    recordFrames();
    expect(par.getEventLog().markers).toHaveLength(7);
    getLog.mockClear();
    click('stPerfStop');
    expect(getLog).toHaveBeenCalledTimes(1);
    expect(setLogger.mock.calls.map(([sink]) => sink === null)).toEqual([false, true]);
    expect(getLog.mock.invocationCallOrder[0]).toBeLessThan(setLogger.mock.invocationCallOrder[1]!);
    expect(diagnostics.mock.calls.every((args) => args.length === 0)).toBe(true);
    expect(par.getDiagnostics()).toBeNull();
    expect(par.getEventLog().markers).toEqual([]);
    expect(document.getElementById('stPerfLogger')!.hidden).toBe(false);
    expect((document.getElementById('stPerfOut') as HTMLTextAreaElement).value).toContain('par-perf/1');
    expect((document.getElementById('stPerfOut') as HTMLTextAreaElement).value).not.toContain('private subtitle text');
    click('stPerfCopyJson');
    const json = vi.mocked(copyText).mock.calls[vi.mocked(copyText).mock.calls.length - 1]![0];
    const exported = JSON.parse(json);
    expect(exported.schema).toBe('par-perf/1');
    expect(exported.logger.schema).toBe('par-logger/1');
    expect(exported.logger.lineEvents).toMatchObject({ count: 7, capped: false, dropped: 0 });
    expect(exported.logger.lineEvents.records).toHaveLength(7);
    expect(exported.logger.lineEvents.records[0]).toMatchObject({ path: 'dom', outcome: 'rendered', mediaTime: 1.1 });
    expect(json).not.toContain('private subtitle text');
    const calls = metrics.mock.calls.length;
    par.renderAt(1.5);
    expect(metrics).toHaveBeenCalledTimes(calls);
    click('stPerfStop');
    expect(setLogger).toHaveBeenCalledTimes(2);
    click('stPerfClear');
    expect(setLogger).toHaveBeenLastCalledWith(null);
    expect(document.getElementById('stPerfLogger')!.hidden).toBe(true);
    expect((document.getElementById('stPerfOut') as HTMLTextAreaElement).value).toBe('');
    click('stPerfRec');
    par.renderAt(1.6);
    expect(par.getEventLog().markers).toHaveLength(1);
    click('stPerfStop');
    expect(par.getEventLog().markers).toEqual([]);
  });

  it('renders the logger timeline with one direct table body and localized semantic headers', () => {
    click('stPerfRec');
    recordFrames();
    now += 1000;
    recordFrames();
    click('stPerfStop');
    click('stPerfCopyJson');
    const calls = vi.mocked(copyText).mock.calls;
    const report = JSON.parse(calls[calls.length - 1]![0]) as ReturnType<typeof buildReport>;
    const output = document.getElementById('stPerfLogger')!;
    const table = output.querySelector('table')!;

    expect(output.getAttribute('aria-live')).toBe('polite');
    expect(table.parentElement!.querySelector('summary')!.textContent).toBe(t('st.loggerTimeline'));
    expect(Array.from(table.children, (child) => child.tagName)).toEqual(['THEAD', 'TBODY']);
    expect(table.querySelectorAll('tbody')).toHaveLength(1);
    expect(table.tBodies[0]!.parentElement).toBe(table);
    expect(Array.from(table.tHead!.rows[0]!.children, (cell) => cell.tagName)).toEqual(Array(16).fill('TH'));
    expect(Array.from(table.tHead!.rows[0]!.cells, (cell) => cell.textContent)).toEqual([
      t('st.loggerAt'), t('st.loggerFrames'), t('st.loggerLate'), t('st.loggerLines'),
      t('st.loggerPrepare'), t('st.loggerRelayout'), t('st.loggerSourceUpdate'), t('st.loggerWindowApply'), t('st.loggerWindowPrepare'), t('st.loggerNotReady'), t('st.loggerSubmitted'),
      t('st.loggerRender'), t('st.loggerSource'), t('st.loggerCanvas'), t('st.loggerComposite'), t('st.loggerJs'),
    ]);
    expect(report.logger.timeline).toHaveLength(2);
    expect(Array.from(table.tBodies[0]!.children, (row) => row.tagName)).toEqual(['TR', 'TR']);
    expect(Array.from(table.tBodies[0]!.rows, (row) => Array.from(row.cells, (cell) => cell.textContent))).toEqual(
      report.logger.timeline.map((bin) => [
        `${(bin.at / 1000).toFixed(1)}s`, String(bin.frames), String(bin.lateFrames), String(bin.linesMax),
        `${bin.prepareMsP95 ?? '-'} ms`, `${bin.relayoutMsP95 ?? '-'} ms`, `${bin.sourceUpdateMsP95 ?? '-'} ms`,
        `${bin.windowApplyMs} ms`, `${bin.windowPrepareMs} ms`, String(bin.sourceNotReadyFrames), String(bin.rendererSubmittedFrames),
        `${bin.renderMsP95} ms`, `${bin.sourceMsP95} ms`, `${bin.canvasMsP95} ms`, `${bin.compositeMsP95} ms`, `${bin.jsMsP95} ms`,
      ]),
    );
  });

  it('records the selected opening from zero and makes hotspot rows directly seekable', () => {
    const range = document.getElementById('stPerfRange') as HTMLSelectElement;
    expect(range.value).toBe('90');
    range.value = '30';
    click('stPerfOpening');
    expect(player.transport.seek).toHaveBeenCalledWith(0);
    expect((document.getElementById('stPerfDur') as HTMLSelectElement).value).toBe('30');
    recordFrames();
    now += 6500; par.renderAt(4); tick!(now);
    click('stPerfStop');
    const hotspot = document.querySelector<HTMLButtonElement>('#stPerfDiag .st-pick')!;
    expect(hotspot).not.toBeNull();
    hotspot.click();
    expect(player.transport.seek).toHaveBeenLastCalledWith(4);
    expect(document.querySelectorAll('#stPerf')).toHaveLength(1);
    expect(document.getElementById('stPerfDiag')!.textContent).not.toContain(t('st.loggerCanvasScene'));
  });

  it('preserves existing playback and produces the report when the view lifecycle stops logging', () => {
    player.transport.play();
    const setLogger = vi.spyOn(par, 'setEventLogger');
    const metrics = vi.spyOn(par, 'getMetrics');
    click('stPerfRec');
    recordFrames();
    perf.stop();
    expect(player.transport.playing).toBe(true);
    expect(player.transport.pause).not.toHaveBeenCalled();
    expect(setLogger.mock.calls.map(([sink]) => sink === null)).toEqual([false, true]);
    expect(par.getDiagnostics()).toBeNull();
    expect(par.getEventLog()).toMatchObject({ markers: [], dropped: 0 });
    expect(document.getElementById('stPerfLogger')!.hidden).toBe(false);
    expect((document.getElementById('stPerfOut') as HTMLTextAreaElement).value).toContain('par-perf/1');
    expect(vi.getTimerCount()).toBe(0);
    metrics.mockClear();
    perf.stop();
    expect(setLogger).toHaveBeenCalledTimes(2);
    expect(metrics).not.toHaveBeenCalled();
  });

  it('cleans up logging on short runs and on timer completion after a session change', () => {
    const setLogger = vi.spyOn(par, 'setEventLogger');
    click('stPerfRec');
    click('stPerfStop');
    expect(setLogger).toHaveBeenLastCalledWith(null);
    click('stPerfRec');
    recordFrames();
    currentSession = {} as StudioSession;
    vi.advanceTimersByTime(30000);
    expect(setLogger).toHaveBeenLastCalledWith(null);
    expect(par.getDiagnostics()).toBeNull();
    expect(par.getEventLog().markers).toEqual([]);
    expect(document.getElementById('stPerfLogger')!.hidden).toBe(true);
    expect(document.getElementById('stPerfStop')!.hidden).toBe(true);
  });
});

describe('diagnostics recorder lifecycle', () => {
  it('resets frames, seek state, and heap baseline when recording restarts', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);

    try {
      let media = 1;
      let heapMB = 10;
      const recorder = new Recorder(() => ({
        media,
        lines: 1,
        drawn: 1,
        fillMpx: 0,
        shed: 0,
        misses: 0,
        skipped: 0,
        dropped: 0,
        drawP50: 0,
        drawP95: 0,
        playing: true,
        heapMB,
      }));

      recorder.start(1000);
      recorder.add(1000);
      media = 2;
      heapMB = 20;
      recorder.add(1016);
      const first = recorder.stop(1020);

      media = 50;
      heapMB = 99;
      recorder.start(2000);
      recorder.add(2000);
      media = 50.1;
      recorder.add(2016);
      const second = recorder.stop(2020);

      expect(first).toMatchObject({ startMedia: 1, endMedia: 2, heapStartMB: 10, heapEndMB: 20, seeks: 0 });
      expect(second).toMatchObject({ startMedia: 50, endMedia: 50.1, heapStartMB: 99, heapEndMB: 99, seeks: 0 });
      expect(first.frames).toHaveLength(1);
      expect(second.frames).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Studio Watch switch logger lifecycle', () => {
  it('stops recording for button and routed switches without measuring or restarting logging in Watch', () => {
    vi.useFakeTimers();
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => { const id = nextId++; callbacks.set(id, cb); return id; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { callbacks.delete(id); }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(StudioPlayer.prototype, 'tick').mockImplementation(() => undefined);
    const disconnect = vi.fn();
    vi.stubGlobal('PerformanceObserver', class { observe = vi.fn(); disconnect = disconnect; });
    const root = document.createElement('div');
    document.body.append(root);
    let par: ReturnType<typeof create> | undefined;
    try {
      requestView('lab');
      initStudio(root);
      const studioLoop = callbacks.get(nextId - 1)!;
      const video = root.querySelector<HTMLVideoElement>('#stVid')!;
      const videoCallbacks: Array<Parameters<NonNullable<VideoFrameSource['requestVideoFrameCallback']>>[0]> = [];
      video.requestVideoFrameCallback = vi.fn((cb) => { videoCallbacks.push(cb); return 0; });
      video.cancelVideoFrameCallback = vi.fn();
      const setLogger = vi.spyOn(PARRenderer.prototype, 'setEventLogger');
      root.querySelector<HTMLButtonElement>('#stPerfRec')!.click();
      par = setLogger.mock.contexts[0] as PARRenderer;
      expect(par).toBeDefined();
      expect(videoCallbacks).toHaveLength(1);
      const recorderFrame = callbacks.get(nextId - 1)!;
      const metrics = vi.spyOn(par!, 'getMetrics');
      const diagnostics = vi.spyOn(par!, 'getDiagnostics');
      root.querySelector<HTMLButtonElement>('#stView [data-view="watch"]')!.click();
      expect(root.querySelector<HTMLElement>('#st')!.dataset.view).toBe('watch');
      expect(setLogger.mock.calls.map(([sink]) => sink === null)).toEqual([false, true]);
      expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(0);
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(par!.getDiagnostics()).toBeNull();
      expect(par!.getEventLog()).toMatchObject({ markers: [], dropped: 0 });
      expect(root.querySelector<HTMLElement>('#stPerfStop')!.hidden).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      diagnostics.mockClear();
      recorderFrame(performance.now());
      videoCallbacks[0]!(performance.now(), { mediaTime: 99 });
      studioLoop(performance.now());
      expect(metrics).not.toHaveBeenCalled();
      expect(diagnostics).not.toHaveBeenCalled();
      expect(videoCallbacks).toHaveLength(1);
      requestView('lab');
      expect(setLogger).toHaveBeenCalledTimes(2);
      root.querySelector<HTMLButtonElement>('#stPerfRec')!.click();
      expect(setLogger).toHaveBeenCalledTimes(3);
      requestView('watch');
      expect(setLogger).toHaveBeenCalledTimes(4);
      expect(setLogger).toHaveBeenLastCalledWith(null);
      expect(disconnect).toHaveBeenCalledTimes(2);
      expect(video.cancelVideoFrameCallback).toHaveBeenCalledTimes(2);
      expect(par!.getDiagnostics()).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
      metrics.mockClear();
      diagnostics.mockClear();
      studioLoop(performance.now());
      vi.advanceTimersByTime(30000);
      requestView('watch');
      expect(metrics).not.toHaveBeenCalled();
      expect(diagnostics).not.toHaveBeenCalled();
      expect(setLogger).toHaveBeenCalledTimes(4);
    } finally {
      par?.destroy();
      document.body.innerHTML = '';
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });
});
