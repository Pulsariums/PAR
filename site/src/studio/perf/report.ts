import { MAX_LINE_EVENTS, type FrameSample, type LongTask, type LoggerLineRecord, type RawRun, type VideoFrameRecord } from './recorder';

/** Schema id of the legacy report; diagnostic fields live in `diagnostics`. */
export const REPORT_SCHEMA = 'par-perf/1';
export const DIAGNOSTIC_SCHEMA = 'par-perf-diagnostics/1';

export type HotspotCause = 'main-thread/dom' | 'canvas/fill/composite' | 'sprite-build/cache' | 'source/decode/window' | 'worker/lookahead' | 'scheduler/unknown';

export interface HotspotEvidence {
  gapMs: number;
  budgetMs: number;
  renderMs: number;
  longTaskMs: number;
  fillMpx: number;
  compositeMs: number;
  spriteMisses: number;
  pending: number;
  deficitMs: number;
  sourceLoading: boolean;
  decodeMs: number;
}

export interface Hotspot {
  at: number;
  media: number;
  durationMs: number;
  frames: number;
  cause: HotspotCause;
  confidence: 'low' | 'medium' | 'high';
  evidence: HotspotEvidence;
}

export interface Env {
  userAgent: string;
  platform: string;
  cores: number | null;
  memoryGB: number | null;
  dpr: number;
  screen: string;
  viewport: string;
  gpu: string | null;
  /** The WebGL renderer is a software rasteriser (SwiftShader, llvmpipe...): the browser is not using a GPU, read the numbers as such. */
  softwareGpu: boolean;
  /** Browser reports long tasks (Chromium only). */
  longTasks: boolean;
}

export interface Setup {
  parVersion: string;
  renderMode: string;
  fps: string;
  videoFps: number | null;
  layout: string;
  region: string;
  hasVideo: boolean;
}

/** The subtitle, described without its name or content. */
export interface FileInfo {
  kind: string;
  bytes: number;
  events: number;
  durationS: number;
}

export interface Dist { p50: number; p90: number; p95: number; p99: number; max: number }

export interface SecondRow {
  sec: number;
  frames: number;
  gapP95: number;
  gapMax: number;
  lines: number;
  drawn: number;
  fillMpx: number;
  misses: number;
}

export interface WorstFrame { at: number; media: number; gap: number; lines: number; drawn: number; fillMpx: number; shed: number }

export interface LoggerTimelineBin {
  at: number;
  durationMs: number;
  frames: number;
  lateFrames: number;
  linesMax: number;
  renderMsP95: number;
  sourceMsP95: number;
  canvasMsP95: number;
  compositeMsP95: number;
  jsMsP95: number;
}

export interface LoggerDenseScene {
  at: number;
  media: number;
  durationMs: number;
  peakLines: number;
  frames: number;
}

export interface LoggerReport {
  schema: 'par-logger/1';
  durationS: number;
  lineEvents: { count: number; capped: boolean; dropped: number; records: LoggerLineRecord[] };
  video: { available: boolean; fps: number | null; frames: number; records: VideoFrameRecord[] };
  causes: { cause: HotspotCause; score: number; share: number }[];
  denseScenes: LoggerDenseScene[];
  timeline: LoggerTimelineBin[];
  limitations: string[];
}

export interface Report {
  schema: typeof REPORT_SCHEMA;
  createdAt: string;
  env: Env;
  setup: Setup;
  file: FileInfo | null;
  run: { durationS: number; startMediaS: number; endMediaS: number; playing: boolean; seeks: number; heapStartMB: number | null; heapEndMB: number | null };
  frames: { count: number; fpsAvg: number; gap: Dist; over33: number; over50: number; over100: number; longTasks: { supported: boolean; count: number; totalMs: number; maxMs: number } };
  render: {
    lines: { p50: number; max: number };
    drawn: { p50: number; max: number };
    fillMpx: { p50: number; max: number };
    drawMsP95: number;
    shedFrames: number;
    shedItemsMax: number;
    spriteMisses: number;
    skipped: number;
    detailDropped: number;
  };
  seconds: SecondRow[];
  worst: WorstFrame[];
  diagnostics: {
    schema: typeof DIAGNOSTIC_SCHEMA;
    budgetMs: number;
    hotspotCount: number;
    longTaskOverlapMs: number;
    hotspots: Hotspot[];
    limitations: string[];
  };
  /** Additive opt-in logger detail; legacy report fields remain stable. */
  logger: LoggerReport;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Nearest-rank percentile of `a` (any order); 0 when empty. Invalid p is clamped. */
export const pct = (a: readonly number[], p: number): number => {
  const s = a.filter(Number.isFinite).slice().sort((x, y) => x - y);
  if (s.length === 0) return 0;
  const q = Math.min(1, Math.max(0, Number.isFinite(p) ? p : 0));
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
};

const max = (a: readonly number[]): number => {
  let n = 0;
  for (const x of a) if (Number.isFinite(x) && x > n) n = x;
  return n;
};
const dist = (a: readonly number[]): Dist => ({ p50: r1(pct(a, 0.5)), p90: r1(pct(a, 0.9)), p95: r1(pct(a, 0.95)), p99: r1(pct(a, 0.99)), max: r1(max(a)) });

/** Differences of a cumulative counter over a run (counters may reset when the cache clears: negative steps count as 0). */
const delta = (frames: readonly FrameSample[], pick: (f: FrameSample) => number): number => {
  let n = 0;
  for (let i = 1; i < frames.length; i++) n += Math.max(0, pick(frames[i]) - pick(frames[i - 1]));
  return n;
};

const seconds = (frames: readonly FrameSample[]): SecondRow[] => {
  const out: SecondRow[] = [];
  const by = new Map<number, FrameSample[]>();
  for (const f of frames) {
    const k = Math.floor(f.at / 1000);
    (by.get(k) ?? by.set(k, []).get(k)!).push(f);
  }
  for (const [sec, fs] of [...by.entries()].sort((a, b) => a[0] - b[0])) {
    const gaps = fs.map((f) => f.gap);
    out.push({
      sec, frames: fs.length, gapP95: r1(pct(gaps, 0.95)), gapMax: r1(max(gaps)), lines: max(fs.map((f) => f.lines)),
      drawn: max(fs.map((f) => f.drawn)), fillMpx: r2(max(fs.map((f) => f.fillMpx))), misses: delta(fs, (f) => f.misses),
    });
  }
  return out;
};

/** The frames that hurt most, spread out: two entries within 300 ms count as one stutter (the worse one is kept). */
export const worstFrames = (frames: readonly FrameSample[], n = 20): WorstFrame[] => {
  const picked: FrameSample[] = [];
  for (const f of frames.slice().sort((a, b) => b.gap - a.gap)) {
    if (picked.length >= n) break;
    if (picked.some((p) => Math.abs(p.at - f.at) < 300)) continue;
    picked.push(f);
  }
  return picked.map((f) => ({ at: f.at, media: r2(f.media), gap: f.gap, lines: f.lines, drawn: f.drawn, fillMpx: r2(f.fillMpx), shed: f.shed }));
};

const tasks = (lt: readonly LongTask[], supported: boolean) => ({ supported, count: lt.length, totalMs: r1(lt.reduce((n, t) => n + Math.max(0, t.dur), 0)), maxMs: r1(max(lt.map((t) => t.dur))) });

const explicitFps = (value: string | number): number | null => {
  const fps = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(fps) && fps > 0 ? fps : null;
};

const renderFpsIsAuto = (setup: Setup): boolean => setup.fps.trim().toLowerCase() === 'auto';

const frameBudget = (setup: Setup): number => {
  // Render/display FPS is authoritative; video FPS fills in only for auto render FPS.
  const fps = renderFpsIsAuto(setup) ? explicitFps(setup.videoFps ?? NaN) : explicitFps(setup.fps);
  return fps === null ? 1000 / 60 : 1000 / fps;
};

type Interval = [number, number];

const mergeIntervals = (intervals: readonly Interval[]): Interval[] => {
  const sorted = intervals.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).slice().sort((a, b) => a[0] - b[0]);
  const merged: Interval[] = [];
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
};

const frameIntervals = (frames: readonly FrameSample[]): Interval[] => frames.filter((f) => f.gap > 0).map((f) => [f.at - f.gap, f.at]);

const longTaskOverlap = (frames: readonly FrameSample[], lt: readonly LongTask[]): number => {
  const intervals = mergeIntervals(frameIntervals(frames));
  const tasks = mergeIntervals(lt.map((task) => [task.at, task.at + Math.max(0, task.dur)]));
  let total = 0;
  let i = 0, j = 0;
  while (i < intervals.length && j < tasks.length) {
    const from = Math.max(intervals[i][0], tasks[j][0]);
    const to = Math.min(intervals[i][1], tasks[j][1]);
    if (to > from) total += to - from;
    if (intervals[i][1] < tasks[j][1]) i++;
    else j++;
  }
  return total;
};

const finite = (n: number | undefined | null): number => Number.isFinite(n) ? n! : 0;

const loggerTimeline = (run: RawRun, budget: number): LoggerTimelineBin[] => {
  const out: LoggerTimelineBin[] = [];
  const by = new Map<number, FrameSample[]>();
  for (const frame of run.frames) {
    const sec = Math.floor(frame.at / 1000);
    (by.get(sec) ?? by.set(sec, []).get(sec)!).push(frame);
  }
  for (const [sec, frames] of [...by.entries()].sort((a, b) => a[0] - b[0])) {
    const render = frames.map((f) => f.render).filter((x): x is NonNullable<FrameSample['render']> => !!x);
    const source = frames.map((f) => f.source).filter((x): x is NonNullable<FrameSample['source']> => !!x);
    const profile = frames.map((f) => f.diagnostics?.canvas).filter((x): x is NonNullable<NonNullable<FrameSample['diagnostics']>['canvas']> => !!x);
    out.push({
      at: sec * 1000, durationMs: Math.min(1000, Math.max(0, run.durationMs - sec * 1000)), frames: frames.length,
      lateFrames: frames.filter((f) => f.gap > budget * 1.25).length, linesMax: max(frames.map((f) => f.lines)),
      renderMsP95: r1(pct(frames.map((f) => f.diagnostics?.renderMs ?? f.renderMs ?? 0), 0.95)),
      sourceMsP95: r1(pct(source.map((s) => s.decodeMs), 0.95)), canvasMsP95: r1(pct(frames.map((f) => f.diagnostics?.canvasMs ?? 0), 0.95)),
      compositeMsP95: r1(pct(render.map((r) => r.compositeMs), 0.95)), jsMsP95: r1(pct(profile.map((p) => p.jsMs), 0.95)),
    });
  }
  return out;
};

const denseScenes = (frames: readonly FrameSample[]): LoggerDenseScene[] => {
  const dense = frames.filter((f) => f.lines >= 150);
  const out: LoggerDenseScene[] = [];
  let group: FrameSample[] = [];
  const flush = (): void => {
    if (!group.length) return;
    const first = group[0], last = group[group.length - 1];
    out.push({ at: first.at, media: r2(first.media), durationMs: r1(Math.max(first.gap, last.at - first.at + last.gap)), peakLines: max(group.map((f) => f.lines)), frames: group.length });
    group = [];
  };
  for (const frame of dense) {
    const prev = group[group.length - 1];
    if (prev && frame.at - prev.at > 1000) flush();
    group.push(frame);
  }
  flush();
  return out.slice(0, 20);
};

const loggerCauses = (frames: readonly FrameSample[], longTaskMs: number): LoggerReport['causes'] => {
  const render = frames.map((f) => f.render).filter((x): x is NonNullable<FrameSample['render']> => !!x);
  const source = frames.map((f) => f.source).filter((x): x is NonNullable<FrameSample['source']> => !!x);
  const scores: [HotspotCause, number][] = [
    ['main-thread/dom', longTaskMs],
    ['source/decode/window', source.reduce((n, s) => n + finite(s.decodeMs), 0)],
    ['worker/lookahead', render.reduce((n, r) => n + finite(r.pending) + Math.max(0, finite(r.deficitMs)), 0)],
    ['sprite-build/cache', render.reduce((n, r) => n + finite(r.spriteMisses), 0)],
    ['canvas/fill/composite', frames.reduce((n, f) => n + finite(f.fillMpx), 0) + render.reduce((n, r) => n + finite(r.compositeMs), 0)],
    ['scheduler/unknown', frames.length ? frames.filter((f) => f.gap > 0).length : 0],
  ];
  const total = scores.reduce((n, [, score]) => n + Math.max(0, score), 0) || 1;
  return scores.filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1]).map(([cause, score]) => ({ cause, score: r1(score), share: r1(score / total) }));
};

const loggerVideo = (records: readonly VideoFrameRecord[] | undefined): LoggerReport['video'] => {
  const frames = records ?? [];
  const times = frames.map((f) => f.at).filter(Number.isFinite);
  const fps = times.length > 1 && times[times.length - 1] > times[0] ? r1((times.length - 1) * 1000 / (times[times.length - 1] - times[0])) : null;
  return { available: frames.length > 0, fps, frames: frames.length, records: frames.slice() };
};

const loggerReport = (run: RawRun, env: Env, setup: Setup, budget: number): LoggerReport => {
  const lines = run.lineEvents ?? [];
  const limitations: string[] = [];
  if (!run.videoFrames?.length) limitations.push(setup.hasVideo ? 'video presentation metadata unavailable' : 'no video');
  if (!run.frames.some((f) => f.diagnostics?.canvas)) limitations.push('canvas timing unavailable');
  if (!run.frames.some((f) => f.source)) limitations.push('source timing unavailable');
  const lineRecords = lines.slice(0, MAX_LINE_EVENTS).map(({ at, media, sessionId, id, index, mediaTime, generation, epoch, path, start, end, outcome }): LoggerLineRecord =>
    ({ at, media, sessionId, id, index, mediaTime, generation, epoch, path, start, end, outcome }));
  const dropped = Math.max(0, run.lineEventsDropped ?? 0) + Math.max(0, lines.length - lineRecords.length);
  return {
    schema: 'par-logger/1', durationS: r1(run.durationMs / 1000),
    lineEvents: { count: lineRecords.length, capped: dropped > 0 || lines.length >= MAX_LINE_EVENTS, dropped, records: lineRecords },
    video: loggerVideo(run.videoFrames), causes: loggerCauses(run.frames, longTaskOverlap(run.frames, env.longTasks ? run.longTasks : [])),
    denseScenes: denseScenes(run.frames), timeline: loggerTimeline(run, budget), limitations,
  };
};

const hotspotCause = (fs: readonly FrameSample[], longTaskMs: number): { cause: HotspotCause; confidence: Hotspot['confidence'] } => {
  const render = fs.map((f) => f.render).filter((x): x is NonNullable<FrameSample['render']> => !!x);
  const source = fs.map((f) => f.source).filter((x): x is NonNullable<FrameSample['source']> => !!x);
  const evidence = {
    main: longTaskMs,
    canvas: fs.reduce((n, f) => n + finite(f.fillMpx), 0),
    composite: render.reduce((n, r) => n + finite(r.compositeMs), 0),
    misses: render.reduce((n, r) => n + finite(r.spriteMisses), 0),
    source: source.reduce((n, s) => n + finite(s.decodeMs), 0) + (source.some((s) => s.loading) ? 1 : 0),
    worker: render.reduce((n, r) => n + finite(r.pending) + Math.max(0, finite(r.deficitMs)), 0),
  };
  const ranked: [HotspotCause, number][] = [['main-thread/dom', evidence.main], ['source/decode/window', evidence.source], ['worker/lookahead', evidence.worker], ['sprite-build/cache', evidence.misses], ['canvas/fill/composite', evidence.canvas + evidence.composite]];
  ranked.sort((a, b) => b[1] - a[1]);
  const [cause, score] = ranked[0];
  if (score <= 0) return { cause: 'scheduler/unknown', confidence: 'low' };
  const second = ranked[1][1];
  return { cause, confidence: score >= 2 * Math.max(1, second) ? 'high' : score > second * 1.15 ? 'medium' : 'low' };
};

const hotspots = (frames: readonly FrameSample[], lt: readonly LongTask[], budget: number): Hotspot[] => {
  const late = frames.filter((f) => f.gap > budget * 1.25);
  const out: Hotspot[] = [];
  let group: FrameSample[] = [];
  const flush = (): void => {
    if (!group.length) return;
    const first = group[0], last = group[group.length - 1];
    const longTaskMs = longTaskOverlap(group, lt);
    const render = group.map((f) => f.render).filter((x): x is NonNullable<FrameSample['render']> => !!x);
    const source = group.map((f) => f.source).filter((x): x is NonNullable<FrameSample['source']> => !!x);
    const classification = hotspotCause(group, longTaskMs);
    out.push({
      at: first.at, media: r2(first.media), durationMs: r1(Math.max(first.gap, last.at - first.at + last.gap)), frames: group.length,
      cause: classification.cause, confidence: classification.confidence,
      evidence: {
        gapMs: r1(Math.max(...group.map((f) => f.gap))), budgetMs: r1(budget), renderMs: r1(max(group.map((f) => f.renderMs ?? f.drawP95))), longTaskMs: r1(longTaskMs),
        fillMpx: r2(max(group.map((f) => f.fillMpx))), compositeMs: r1(max(render.map((r) => r.compositeMs))), spriteMisses: delta(group, (f) => f.misses),
        pending: max(render.map((r) => r.pending)), deficitMs: r1(max(render.map((r) => r.deficitMs))), sourceLoading: source.some((s) => s.loading), decodeMs: r1(max(source.map((s) => s.decodeMs))),
      },
    });
    group = [];
  };
  for (const frame of late) {
    const previous = group[group.length - 1];
    const recordingGap = previous && frame.at - previous.at > Math.max(300, budget * 4);
    // Match Recorder's seek threshold so a media jump cannot merge two hotspots.
    const mediaSeek = previous && Number.isFinite(frame.media) && Number.isFinite(previous.media) && Math.abs(frame.media - previous.media) > 2;
    if (group.length && (recordingGap || mediaSeek)) flush();
    group.push(frame);
  }
  flush();
  return out;
};

const diagnosticLimitations = (run: RawRun, env: Env, setup: Setup): string[] => {
  const out: string[] = [];
  if (!env.longTasks) out.push('longtask observer unsupported');
  if (!run.frames.length) out.push('no frame samples');
  if (!run.frames.some((f) => f.render)) out.push('renderer samples unavailable');
  if (!run.frames.some((f) => f.source)) out.push('source samples unavailable');
  if ((!renderFpsIsAuto(setup) && explicitFps(setup.fps) === null) || (renderFpsIsAuto(setup) && explicitFps(setup.videoFps ?? NaN) === null)) out.push('frame budget defaulted to 60 fps');
  if (!run.playing) out.push('run includes a pause');
  return out;
};

export const buildReport = (run: RawRun, env: Env, setup: Setup, file: FileInfo | null, now = new Date()): Report => {
  const fs = run.frames;
  const gaps = fs.map((f) => f.gap);
  const sum = gaps.reduce((a, b) => a + b, 0);
  const budgetMs = frameBudget(setup);
  const diagnosticHotspots = hotspots(fs, env.longTasks ? run.longTasks : [], budgetMs);
  return {
    schema: REPORT_SCHEMA,
    createdAt: now.toISOString(),
    env, setup, file,
    run: { durationS: r1(run.durationMs / 1000), startMediaS: r2(run.startMedia), endMediaS: r2(run.endMedia), playing: run.playing, seeks: run.seeks, heapStartMB: run.heapStartMB, heapEndMB: run.heapEndMB },
    frames: {
      count: fs.length, fpsAvg: sum > 0 ? r1((fs.length * 1000) / sum) : 0, gap: dist(gaps),
      over33: gaps.filter((g) => g > 33.4).length, over50: gaps.filter((g) => g > 50).length, over100: gaps.filter((g) => g > 100).length,
      longTasks: tasks(run.longTasks, env.longTasks),
    },
    render: {
      lines: { p50: pct(fs.map((f) => f.lines), 0.5), max: max(fs.map((f) => f.lines)) },
      drawn: { p50: pct(fs.map((f) => f.drawn), 0.5), max: max(fs.map((f) => f.drawn)) },
      fillMpx: { p50: r2(pct(fs.map((f) => f.fillMpx), 0.5)), max: r2(max(fs.map((f) => f.fillMpx))) },
      drawMsP95: r2(pct(fs.map((f) => f.drawP95), 0.95)),
      shedFrames: fs.filter((f) => f.shed > 0).length, shedItemsMax: max(fs.map((f) => f.shed)),
      spriteMisses: delta(fs, (f) => f.misses), skipped: delta(fs, (f) => f.skipped), detailDropped: delta(fs, (f) => f.dropped),
    },
    seconds: seconds(fs),
    worst: worstFrames(fs),
    diagnostics: { schema: DIAGNOSTIC_SCHEMA, budgetMs: r1(budgetMs), hotspotCount: diagnosticHotspots.length, longTaskOverlapMs: r1(longTaskOverlap(fs, env.longTasks ? run.longTasks : [])), hotspots: diagnosticHotspots, limitations: diagnosticLimitations(run, env, setup) },
    logger: loggerReport(run, env, setup, budgetMs),
  };
};

const n0 = (n: number): string => n.toLocaleString('en-US');
const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** About ten lines to paste into a chat: what a person needs to judge the run without opening the JSON. */
export const summaryText = (r: Report): string => {
  const e = r.env, g = r.frames.gap, d = r.render;
  const lt = r.frames.longTasks;
  const lines = [
    `PAR perf report (${r.schema}, PAR ${r.setup.parVersion})`,
    `${e.platform} | ${e.cores ?? '?'} cores${e.memoryGB ? ` | ${e.memoryGB} GB` : ''} | DPR ${e.dpr} | ${e.screen} | GPU: ${e.gpu ?? 'unknown'}${e.softwareGpu ? ' [SOFTWARE rendering]' : ''}`,
    `UA: ${e.userAgent}`,
    r.file ? `File: ${r.file.kind.toUpperCase()}, ${n0(r.file.bytes)} B, ${n0(r.file.events)} events, ${mmss(r.file.durationS)}` : 'File: none (test card)',
    `Setup: render ${r.setup.renderMode}, fps ${r.setup.fps}, video fps ${r.setup.videoFps ?? 'auto'}, layout ${r.setup.layout}, ${r.setup.hasVideo ? 'video' : 'test card'}`,
    `Run: ${r.run.durationS} s from ${r.run.startMediaS} s${r.run.playing ? ' (playing)' : ' (not playing the whole time)'}, ${n0(r.frames.count)} frames, ${r.frames.fpsAvg} fps average${r.run.seeks ? `, ${r.run.seeks} seeks` : ''}`,
    `Frame gap ms: p50 ${g.p50} / p95 ${g.p95} / p99 ${g.p99} / max ${g.max}; over 33 ms: ${r.frames.over33}, over 50: ${r.frames.over50}, over 100: ${r.frames.over100}`,
    lt.supported ? `Long tasks: ${lt.count} (total ${lt.totalMs} ms, max ${lt.maxMs} ms)` : 'Long tasks: not measured by this browser',
    `Canvas path: lines p50 ${d.lines.p50} / max ${n0(d.lines.max)}; drawn p50 ${d.drawn.p50} / max ${n0(d.drawn.max)}; fill p50 ${d.fillMpx.p50} / max ${d.fillMpx.max} Mpx; draw call p95 ~${d.drawMsP95} ms`,
    `Under load: shed in ${d.shedFrames} frames (max ${d.shedItemsMax} items), sprite misses ${n0(d.spriteMisses)}, skipped ${n0(d.skipped)}, blurs dropped ${n0(d.detailDropped)}`,
  ];
  if (r.worst.length) lines.push(`Worst frames: ${r.worst.slice(0, 5).map((w) => `${w.media}s ${w.gap}ms (${n0(w.lines)} lines, ${n0(w.drawn)} drawn)`).join('; ')}`);
  return lines.join('\n');
};
