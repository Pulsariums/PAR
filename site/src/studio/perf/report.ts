import type { FrameSample, LongTask, RawRun } from './recorder';

/** Schema id of the report; bump when a field changes meaning. */
export const REPORT_SCHEMA = 'par-perf/1';

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
}

const r1 = (n: number): number => Math.round(n * 10) / 10;
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Nearest-rank percentile of `a` (any order); 0 when empty. */
export const pct = (a: readonly number[], p: number): number => {
  if (a.length === 0) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

const dist = (a: readonly number[]): Dist => ({ p50: r1(pct(a, 0.5)), p90: r1(pct(a, 0.9)), p95: r1(pct(a, 0.95)), p99: r1(pct(a, 0.99)), max: r1(a.length ? Math.max(...a) : 0) });
const max = (a: readonly number[]): number => (a.length ? Math.max(...a) : 0);

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

const tasks = (lt: readonly LongTask[], supported: boolean) => ({ supported, count: lt.length, totalMs: lt.reduce((n, t) => n + t.dur, 0), maxMs: max(lt.map((t) => t.dur)) });

export const buildReport = (run: RawRun, env: Env, setup: Setup, file: FileInfo | null, now = new Date()): Report => {
  const fs = run.frames;
  const gaps = fs.map((f) => f.gap);
  const sum = gaps.reduce((a, b) => a + b, 0);
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
      drawMsP95: r2(pct(fs.map((f) => f.drawP95), 0.5)),
      shedFrames: fs.filter((f) => f.shed > 0).length, shedItemsMax: max(fs.map((f) => f.shed)),
      spriteMisses: delta(fs, (f) => f.misses), skipped: delta(fs, (f) => f.skipped), detailDropped: delta(fs, (f) => f.dropped),
    },
    seconds: seconds(fs),
    worst: worstFrames(fs),
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
