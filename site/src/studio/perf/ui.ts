import { VERSION } from '../../../../src/index';
import { onLang, t } from '../../i18n/i18n';
import { copyText } from '../../player/snippet';
import { $, el } from '../../player/dom';
import type { Player } from '../../player/player';
import type { StudioSession } from '../session';

import { collectEnv } from './env';
import { Recorder, type FrameSample } from './recorder';
import { buildReport, summaryText, type FileInfo, type HotspotCause, type LoggerReport, type Report } from './report';
import { busiest } from './scan';

export const PERF_HTML = `
<details class="st-fold" id="stPerf">
  <summary><span data-i18n="st.logger"></span></summary>
  <p class="hint" data-i18n="st.loggerHint"></p>
  <div class="row">
    <label class="fld inline"><span data-i18n="st.loggerFor"></span>
      <select id="stPerfDur"><option value="15">15 s</option><option value="30" selected>30 s</option><option value="60">60 s</option><option value="120">120 s</option></select></label>
    <button type="button" class="btn sm primary" id="stPerfRec" data-i18n="st.loggerStart"></button>
    <button type="button" class="btn sm" id="stPerfStop" data-i18n="st.loggerStop" hidden></button>
    <button type="button" class="btn sm" id="stPerfClear" data-i18n="st.loggerClear"></button>
  </div>
  <div class="row">
    <button type="button" class="btn sm" id="stPerfScan" data-i18n="st.loggerScan"></button>
  </div>
  <p class="hint" id="stPerfStatus" role="status"></p>
  <div class="chips" id="stPerfMoments"></div>
  <textarea id="stPerfOut" readonly rows="11" spellcheck="false" data-i18n-attr="aria-label:st.logger"></textarea>
  <section id="stPerfDiag" class="st-perf-diag" hidden aria-live="polite"></section>
  <section id="stPerfLogger" class="st-perf-diag" hidden aria-live="polite"></section>
  <div class="row">
    <button type="button" class="btn sm" id="stPerfCopy" data-i18n="st.loggerCopy" disabled></button>
    <button type="button" class="btn sm" id="stPerfCopyJson" data-i18n="st.loggerCopyJson" disabled></button>
    <button type="button" class="btn sm" id="stPerfSave" data-i18n="st.loggerSave" disabled></button>
  </div>
</details>`;

const heapMB = (): number | null => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
};

interface Deps {
  player: Player;
  session: () => StudioSession | null;
  /** Current advanced choices (render mode, fps, video fps). */
  choices: () => { renderMode: string; fps: 'auto' | number; videoFps: number | null };
}

interface RecordingContext {
  session: StudioSession | null;
  file: FileInfo | null;
  setup: ReturnType<Deps['choices']> & { layout: string; region: string; hasVideo: boolean };
}

/**
 * The performance report: record the player for a while (it plays on its own), then get the numbers as a short text to paste and as JSON
 * (`par-perf/1`), or find the busiest moments of the file first and record there. Nothing leaves the page; no file name or content is in the report.
 */
export const initPerf = ({ player, session, choices }: Deps) => {
  const par = player.par;
  let recording: RecordingContext | null = null;
  const video = player.video as HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: (now: number, metadata: { mediaTime: number; presentedFrames?: number; expectedDisplayTime?: number; processingDuration?: number }) => void) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
  };
  const rec = new Recorder(() => {
    const m = par.getMetrics();
    const r = m.render;
    const source = par.getSourceStats();
    const diag = par.getDiagnostics();
    return {
      media: m.time, lines: m.activeLines, drawn: r.drawn, fillMpx: r.fillMpx, shed: r.shed, misses: r.spriteMisses, skipped: r.skipped, dropped: r.detailDropped,
      diagnostics: diag ?? undefined, drawP50: r.frameMs.p50, drawP95: r.frameMs.p95, renderMs: diag?.renderMs ?? 0,
      render: {
        domLines: r.domLines, canvasLines: r.canvasLines, spriteHits: r.spriteHits, spriteMisses: r.spriteMisses, workers: r.workers, workerBuilt: r.workerBuilt,
        planQueued: r.planQueued, planLeadMs: r.planLeadMs, pending: r.pending, readyMs: r.readyMs, deficitMs: r.deficitMs, buildRate: r.buildRate,
        missing: r.missing, missedTotal: r.missedTotal, held: r.held, compositeMs: r.compositeMs, stalls: r.stalls, stallMs: r.stallMs, evictions: r.evictions,
      },
      source: { windowEvents: source.windowEvents, loading: source.loading, bytesRead: source.bytesRead, decodeMs: source.decodeMs, indexMs: source.indexMs },
      playing: player.transport.playing, heapMB: heapMB(),
    } satisfies Omit<FrameSample, 'at' | 'gap'> & { playing: boolean; heapMB: number | null };
  }, video, par);
  const out = $<HTMLTextAreaElement>('stPerfOut');
  const status = $('stPerfStatus');
  const recBtn = $<HTMLButtonElement>('stPerfRec');
  const stopBtn = $<HTMLButtonElement>('stPerfStop');
  const scanBtn = $<HTMLButtonElement>('stPerfScan');
  const moments = $('stPerfMoments');
  const diagnostics = $('stPerfDiag');
  const loggerOutput = $('stPerfLogger');
  const clearBtn = $<HTMLButtonElement>('stPerfClear');
  const buttons = ['stPerfCopy', 'stPerfCopyJson', 'stPerfSave'].map((id) => $<HTMLButtonElement>(id));
  let last: Report | null = null;
  let timer = 0;
  let tick = 0;
  let startedPlayback = false;
  let scan: AbortController | null = null;
  let recordingGeneration = 0;
  let reportSession: StudioSession | null = null;
  let reportGeneration = 0;

  const say = (msg: string): void => { status.textContent = msg; };

  const causeKey: Record<HotspotCause, keyof import('../../i18n/en').Dict> = {
    'main-thread/dom': 'perf.diag.cause.mainThread',
    'canvas/fill/composite': 'perf.diag.cause.canvas',
    'sprite-build/cache': 'perf.diag.cause.sprite',
    'source/decode/window': 'perf.diag.cause.source',
    'worker/lookahead': 'perf.diag.cause.worker',
    'scheduler/unknown': 'perf.diag.cause.scheduler',
  };

  const confidenceKey = (confidence: 'low' | 'medium' | 'high'): keyof import('../../i18n/en').Dict => `perf.diag.confidence.${confidence}`;

  const clearDiagnostics = (): void => {
    diagnostics.hidden = true;
    diagnostics.replaceChildren();
    loggerOutput.hidden = true;
    loggerOutput.replaceChildren();
  };

  const addDiagnosticValue = (root: HTMLElement, label: string, value: string): void => {
    const row = el('div');
    row.append(el('dt', '', label), el('dd', '', value));
    root.append(row);
  };

  const renderDiagnostics = (report: Report): void => {
    const d = report.diagnostics;
    diagnostics.replaceChildren();
    diagnostics.hidden = false;
    diagnostics.append(el('h3', '', t('perf.diag.title')));

    const summary = el('dl', 'st-kv');
    addDiagnosticValue(summary, t('perf.diag.hotspots', { n: d.hotspotCount }), String(d.hotspotCount));
    addDiagnosticValue(summary, t('perf.diag.budget', { ms: d.budgetMs }), `${d.budgetMs} ms`);
    addDiagnosticValue(summary, t('perf.diag.overlap', { ms: d.longTaskOverlapMs }), `${d.longTaskOverlapMs} ms`);
    diagnostics.append(summary);

    if (d.hotspots.length) {
      const list = el('ul', 'st-list');
      for (const hotspot of d.hotspots) {
        const item = el('li', 'st-item');
        const seek = document.createElement('button');
        seek.type = 'button';
        seek.className = 'st-pick';
        const body = el('span', 'st-body');
        body.append(
          el('span', 'st-name', t('perf.diag.hotspotAt', { media: hotspot.media, duration: hotspot.durationMs, frames: hotspot.frames })),
          el('span', 'st-meta', `${t(causeKey[hotspot.cause])} / ${t(confidenceKey(hotspot.confidence))}`),
          el('span', 'st-meta', `${t('perf.diag.evidence')}: ${hotspot.evidence.gapMs} ms / ${hotspot.evidence.renderMs} ms / ${hotspot.evidence.longTaskMs} ms`),
        );
        seek.append(body);
        const generation = reportGeneration;
        seek.addEventListener('click', () => {
          if (generation !== reportGeneration || reportSession !== session()) return;
          player.transport.seek(hotspot.media);
        });
        item.append(seek);
        list.append(item);
      }
      diagnostics.append(list);
    } else {
      diagnostics.append(el('p', 'hint', t('perf.diag.noData')));
    }

    if (d.limitations.length) diagnostics.append(el('p', 'hint', `${t('perf.diag.limitations')}: ${d.limitations.join('; ')}`));
  };

  const renderLogger = (report: Report): void => {
    const l: LoggerReport = report.logger;
    loggerOutput.replaceChildren();
    loggerOutput.hidden = false;
    loggerOutput.append(el('h3', '', t('st.loggerSummary')));
    const summary = el('dl', 'st-kv');
    addDiagnosticValue(summary, t('st.loggerDuration'), `${l.durationS} s`);
    addDiagnosticValue(summary, t('st.loggerVideo'), l.video.available ? `${t('st.loggerAvailable')} (${l.video.fps ?? '—'} fps, ${l.video.frames})` : t('st.loggerUnavailable'));
    addDiagnosticValue(summary, t('st.loggerLineCount'), `${l.lineEvents.count}${l.lineEvents.capped ? '+' : ''}`);
    if (l.causes.length) addDiagnosticValue(summary, t('st.loggerCauses'), l.causes.slice(0, 3).map((c) => `${t(causeKey[c.cause])} ${Math.round(c.share * 100)}%`).join('; '));
    loggerOutput.append(summary);

    if (l.denseScenes.length) {
      const list = el('div', 'chips');
      for (const scene of l.denseScenes.slice(0, 5)) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'chip';
        button.textContent = t('st.loggerDense', { media: scene.media, lines: scene.peakLines, duration: scene.durationMs });
        const generation = reportGeneration;
        button.addEventListener('click', () => { if (generation === reportGeneration && reportSession === session()) player.transport.seek(scene.media); });
        list.append(button);
      }
      loggerOutput.append(el('h4', '', t('st.loggerDenseTitle')), list);
    }

    if (l.timeline.length) {
      const details = document.createElement('details');
      const summaryNode = document.createElement('summary'); summaryNode.textContent = t('st.loggerTimeline'); details.append(summaryNode);
      const table = document.createElement('table'); table.className = 'st-table';
      const head = document.createElement('tr');
      for (const label of ['st.loggerAt', 'st.loggerFrames', 'st.loggerLate', 'st.loggerLines', 'st.loggerRender', 'st.loggerSource', 'st.loggerCanvas', 'st.loggerComposite', 'st.loggerJs']) head.append(el('th', '', t(label as keyof import('../../i18n/en').Dict)));
      const thead = document.createElement('thead'); thead.append(head); table.append(thead);
      const body = document.createElement('tbody');
      for (const bin of l.timeline) {
        const row = document.createElement('tr');
        for (const value of [
          `${(bin.at / 1000).toFixed(1)}s`, bin.frames, bin.lateFrames, bin.linesMax,
          `${bin.renderMsP95} ms`, `${bin.sourceMsP95} ms`, `${bin.canvasMsP95} ms`, `${bin.compositeMsP95} ms`, `${bin.jsMsP95} ms`,
        ]) row.append(el('td', '', String(value)));
        body.append(row);
      }
      table.append(body); details.append(table); loggerOutput.append(details);
    }
    if (l.limitations.length) loggerOutput.append(el('p', 'hint', `${t('st.loggerLimitations')}: ${l.limitations.join('; ')}`));
  };

  const fileInfo = (): FileInfo | null => {
    const s = session();
    return s ? { kind: s.kind, bytes: s.blob.size, events: s.source.eventCount, durationS: Math.round(s.source.duration * 10) / 10 } : null;
  };

  const finish = (): void => {
    if (!recording) return;
    window.clearTimeout(timer);
    window.clearInterval(tick);
    timer = 0;
    tick = 0;
    const context = recording;
    recording = null;
    const run = rec.stop();
    par.setDiagnostics(false);
    if (startedPlayback) player.transport.pause();
    startedPlayback = false;
    recBtn.hidden = false;
    stopBtn.hidden = true;
    if (run.frames.length < 5) { say(t('st.perfShort')); return; }
    if (!context || context.session !== session()) { say(t('st.perfShort')); return; }
    last = buildReport(run, collectEnv(rec.longTasksSupported), {
      parVersion: VERSION, renderMode: context.setup.renderMode, fps: String(context.setup.fps), videoFps: context.setup.videoFps, layout: context.setup.layout,
      region: context.setup.region, hasVideo: context.setup.hasVideo,
    }, context.file);
    reportSession = context.session;
    reportGeneration = recordingGeneration;
    out.value = summaryText(last);
    renderDiagnostics(last);
    renderLogger(last);
    buttons.forEach((b) => { b.disabled = false; });
    say(t('st.perfDone', { n: last.frames.count, s: last.run.durationS }));
  };

  const start = (): void => {
    if (rec.active) return;
    clearDiagnostics();
    const secs = Number($<HTMLSelectElement>('stPerfDur').value);
    const s = session();
    const c = choices();
    const lay = par.getMetrics();
    recording = { session: s, file: fileInfo(), setup: { ...c, layout: `${lay.layoutSize.width}x${lay.layoutSize.height} (${lay.layoutSource})`, region: `${lay.regionSize.width}x${lay.regionSize.height}`, hasVideo: player.hasVideo } };
    recordingGeneration++;
    startedPlayback = !player.transport.playing;
    par.setDiagnostics(true);
    rec.start();
    if (startedPlayback) player.transport.play();
    recBtn.hidden = true;
    stopBtn.hidden = false;
    const t0 = performance.now();
    tick = window.setInterval(() => say(t('st.perfRunning', { s: Math.round((performance.now() - t0) / 1000), total: secs })), 500);
    say(t('st.perfRunning', { s: 0, total: secs }));
    timer = window.setTimeout(finish, secs * 1000);
  };

  recBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', finish);
  clearBtn.addEventListener('click', () => {
    if (rec.active) return;
    rec.clear();
    par.setDiagnostics(false);
    last = null;
    reportSession = null;
    reportGeneration++;
    out.value = '';
    moments.replaceChildren();
    clearDiagnostics();
    buttons.forEach((b) => { b.disabled = true; });
    say(t('st.loggerCleared'));
  });

  scanBtn.addEventListener('click', async () => {
    const s = session();
    if (!s) { say(t('st.perfNoSub')); return; }
    if (scan) { scan.abort(); return; }
    const ac = (scan = new AbortController());
    scanBtn.textContent = t('st.cancel');
    moments.replaceChildren();
    try {
      const found = await busiest(s.source, 5, { signal: ac.signal, onProgress: (f) => say(t('st.perfScanning', { pct: Math.round(f * 100) })) });
      say(found.length ? t('st.perfFound') : t('st.perfNone'));
      for (const m of found) {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: 'chip', textContent: `${m.t.toFixed(1)} s · ${m.lines.toLocaleString('en-US')}` });
        b.addEventListener('click', () => { player.transport.seek(Math.max(0, m.t - 2)); start(); });
        moments.append(b);
      }
    } catch (e) { say(t('st.fail', { error: e instanceof Error ? e.message : String(e) })); } finally { scan = null; scanBtn.textContent = t('st.loggerScan'); }
  });

  $('stPerfCopy').addEventListener('click', async () => say((await copyText(out.value)) ? t('st.perfCopied') : t('st.perfCopyFail')));
  $('stPerfCopyJson').addEventListener('click', async () => { if (last) say((await copyText(JSON.stringify(last, null, 1))) ? t('st.perfCopied') : t('st.perfCopyFail')); });
  $('stPerfSave').addEventListener('click', () => {
    if (!last) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(last, null, 1)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: `par-perf-${last.createdAt.slice(0, 19).replace(/[:T]/g, '-')}.json` }).click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  onLang(() => { if (last && !rec.active) { renderDiagnostics(last); renderLogger(last); } });

  return { stop: finish };
};
