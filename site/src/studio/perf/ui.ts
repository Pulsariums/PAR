import { VERSION } from '../../../../src/index';
import { t } from '../../i18n/i18n';
import { copyText } from '../../player/snippet';
import { $ } from '../../player/dom';
import type { Player } from '../../player/player';
import type { StudioSession } from '../session';

import { collectEnv } from './env';
import { Recorder, type FrameSample } from './recorder';
import { buildReport, summaryText, type FileInfo, type Report } from './report';
import { busiest } from './scan';

export const PERF_HTML = `
<details class="st-fold" id="stPerf">
  <summary><span data-i18n="st.perf"></span></summary>
  <p class="hint" data-i18n="st.perfHint"></p>
  <div class="row">
    <label class="fld inline"><span data-i18n="st.perfFor"></span>
      <select id="stPerfDur"><option value="15">15 s</option><option value="30" selected>30 s</option><option value="60">60 s</option><option value="120">120 s</option></select></label>
    <button type="button" class="btn sm primary" id="stPerfRec" data-i18n="st.perfRec"></button>
    <button type="button" class="btn sm" id="stPerfStop" data-i18n="st.perfStop" hidden></button>
    <button type="button" class="btn sm" id="stPerfScan" data-i18n="st.perfScan"></button>
  </div>
  <p class="hint" id="stPerfStatus" role="status"></p>
  <div class="chips" id="stPerfMoments"></div>
  <textarea id="stPerfOut" readonly rows="11" spellcheck="false" data-i18n-attr="aria-label:st.perf"></textarea>
  <div class="row">
    <button type="button" class="btn sm" id="stPerfCopy" data-i18n="st.perfCopy" disabled></button>
    <button type="button" class="btn sm" id="stPerfCopyJson" data-i18n="st.perfCopyJson" disabled></button>
    <button type="button" class="btn sm" id="stPerfSave" data-i18n="st.perfSave" disabled></button>
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

/**
 * The performance report: record the player for a while (it plays on its own), then get the numbers as a short text to paste and as JSON
 * (`par-perf/1`), or find the busiest moments of the file first and record there. Nothing leaves the page; no file name or content is in the report.
 */
export const initPerf = ({ player, session, choices }: Deps) => {
  const par = player.par;
  const rec = new Recorder(() => {
    const m = par.getMetrics();
    const r = m.render;
    return {
      media: m.time, lines: m.activeLines, drawn: r.drawn, fillMpx: r.fillMpx, shed: r.shed, misses: r.spriteMisses, skipped: r.skipped, dropped: r.detailDropped,
      drawP50: r.frameMs.p50, drawP95: r.frameMs.p95, playing: player.transport.playing, heapMB: heapMB(),
    } satisfies Omit<FrameSample, 'at' | 'gap'> & { playing: boolean; heapMB: number | null };
  });
  const out = $<HTMLTextAreaElement>('stPerfOut');
  const status = $('stPerfStatus');
  const recBtn = $<HTMLButtonElement>('stPerfRec');
  const stopBtn = $<HTMLButtonElement>('stPerfStop');
  const scanBtn = $<HTMLButtonElement>('stPerfScan');
  const moments = $('stPerfMoments');
  const buttons = ['stPerfCopy', 'stPerfCopyJson', 'stPerfSave'].map((id) => $<HTMLButtonElement>(id));
  let last: Report | null = null;
  let timer = 0;
  let tick = 0;
  let startedPlayback = false;
  let scan: AbortController | null = null;

  const say = (msg: string): void => { status.textContent = msg; };

  const fileInfo = (): FileInfo | null => {
    const s = session();
    return s ? { kind: s.kind, bytes: s.blob.size, events: s.source.eventCount, durationS: Math.round(s.source.duration * 10) / 10 } : null;
  };

  const finish = (): void => {
    window.clearTimeout(timer);
    window.clearInterval(tick);
    const run = rec.stop();
    if (startedPlayback) player.transport.pause();
    startedPlayback = false;
    recBtn.hidden = false;
    stopBtn.hidden = true;
    if (run.frames.length < 5) { say(t('st.perfShort')); return; }
    const c = choices();
    const lay = par.getMetrics();
    last = buildReport(run, collectEnv(rec.longTasksSupported), {
      parVersion: VERSION, renderMode: c.renderMode, fps: String(c.fps), videoFps: c.videoFps, layout: `${lay.layoutSize.width}x${lay.layoutSize.height} (${lay.layoutSource})`,
      region: `${lay.regionSize.width}x${lay.regionSize.height}`, hasVideo: player.hasVideo,
    }, fileInfo());
    out.value = summaryText(last);
    buttons.forEach((b) => { b.disabled = false; });
    say(t('st.perfDone', { n: last.frames.count, s: last.run.durationS }));
  };

  const start = (): void => {
    if (rec.active) return;
    const secs = Number($<HTMLSelectElement>('stPerfDur').value);
    startedPlayback = !player.transport.playing;
    if (startedPlayback) player.transport.play();
    rec.start();
    recBtn.hidden = true;
    stopBtn.hidden = false;
    const t0 = performance.now();
    tick = window.setInterval(() => say(t('st.perfRunning', { s: Math.round((performance.now() - t0) / 1000), total: secs })), 500);
    say(t('st.perfRunning', { s: 0, total: secs }));
    timer = window.setTimeout(finish, secs * 1000);
  };

  recBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', finish);

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
    } catch (e) { say(t('st.fail', { error: e instanceof Error ? e.message : String(e) })); } finally { scan = null; scanBtn.textContent = t('st.perfScan'); }
  });

  $('stPerfCopy').addEventListener('click', async () => say((await copyText(out.value)) ? t('st.perfCopied') : t('st.perfCopyFail')));
  $('stPerfCopyJson').addEventListener('click', async () => { if (last) say((await copyText(JSON.stringify(last, null, 1))) ? t('st.perfCopied') : t('st.perfCopyFail')); });
  $('stPerfSave').addEventListener('click', () => {
    if (!last) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(last, null, 1)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: `par-perf-${last.createdAt.slice(0, 19).replace(/[:T]/g, '-')}.json` }).click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
};
