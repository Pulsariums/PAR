import { t } from '../../i18n/i18n';
import { $ } from '../../player/dom';
import { copyText } from '../../player/snippet';
import type { StudioSession } from '../session';

import type { FromAnalyzeWorker, ToAnalyzeWorker } from './protocol';

export const ANALYZE_HTML = `
<details class="st-fold" id="stAnalyze">
  <summary><span data-i18n="st.an"></span></summary>
  <p class="hint" data-i18n="st.anHint"></p>
  <div class="row">
    <label class="fld"><span data-i18n="st.optFps"></span><select id="stAnFps"><option>23.976</option><option selected>24</option><option>25</option><option>29.97</option><option>30</option><option>50</option><option>59.94</option><option>60</option></select></label>
    <label class="fld"><span data-i18n="st.anWidth"></span><input type="number" id="stAnWidth" min="0" step="1" value="0" inputmode="numeric"></label>
    <button type="button" class="btn sm primary" id="stAnRun" data-i18n="st.anRun"></button>
    <button type="button" class="btn sm" id="stAnCancel" data-i18n="st.cancel" hidden></button>
  </div>
  <p class="hint" id="stAnStatus" role="status"></p>
  <textarea id="stAnOut" readonly rows="12" spellcheck="false" data-i18n-attr="aria-label:st.an"></textarea>
  <div class="row">
    <button type="button" class="btn sm" id="stAnCopy" data-i18n="st.perfCopy" disabled></button>
    <button type="button" class="btn sm" id="stAnCopyJson" data-i18n="st.perfCopyJson" disabled></button>
    <button type="button" class="btn sm" id="stAnSave" data-i18n="st.perfSave" disabled></button>
  </div>
</details>`;

interface Deps {
  session: () => StudioSession | null;
  videoFps: () => number | null;
}

/** `name.ass` => `name.par-analyze.json`. */
export const analyzeName = (name: string): string => `${name.replace(/\.(ass|ssa|txt|xpar|par)$/i, '')}.par-analyze.json`;

/**
 * The script analyzer panel: burst map, sprite keys and build cost, canvas eligibility (docs/performance.md), computed in a Worker
 * with progress and cancel, as a short text and as JSON (`par-analyze/1`). Nothing leaves the page.
 */
export const initAnalyze = ({ session, videoFps }: Deps) => {
  const run = $<HTMLButtonElement>('stAnRun');
  const cancel = $<HTMLButtonElement>('stAnCancel');
  const out = $<HTMLTextAreaElement>('stAnOut');
  const fpsSel = $<HTMLSelectElement>('stAnFps');
  const buttons = ['stAnCopy', 'stAnCopyJson', 'stAnSave'].map((id) => $<HTMLButtonElement>(id));
  const say = (msg: string): void => { $('stAnStatus').textContent = msg; };
  let worker: Worker | null = null;
  let seq = 0;
  let json = '';
  let name = 'subtitle';

  $('stAnalyze').addEventListener('toggle', () => {
    const v = videoFps();
    const o = v === null ? undefined : [...fpsSel.options].find((x) => Math.abs(Number(x.value) - v) < 0.01);
    if (o) fpsSel.value = o.value;
  });

  run.addEventListener('click', () => {
    const s = session();
    if (!s) { say(t('st.perfNoSub')); return; }
    const id = ++seq;
    const w = (worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }));
    run.hidden = true; cancel.hidden = false;
    buttons.forEach((b) => { b.disabled = true; });
    out.value = '';
    name = s.name;
    const onMsg = (e: MessageEvent<FromAnalyzeWorker>): void => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.op === 'progress') { say(t('st.anRunning', { pct: Math.round(m.fraction * 100) })); return; }
      w.removeEventListener('message', onMsg);
      run.hidden = false; cancel.hidden = true;
      if (m.op === 'error') { say(m.aborted ? t('st.cancelled') : t('st.fail', { error: m.message })); return; }
      json = JSON.stringify(m.report, null, 1);
      out.value = m.text;
      buttons.forEach((b) => { b.disabled = false; });
      say(t('st.anDone', { s: (m.ms / 1000).toFixed(1) }));
    };
    w.addEventListener('message', onMsg);
    say(t('st.anReading'));
    w.postMessage({ op: 'run', id, blob: s.blob, kind: s.kind, fps: Number(fpsSel.value), width: Number($<HTMLInputElement>('stAnWidth').value) || 0 } satisfies ToAnalyzeWorker);
    cancel.onclick = () => w.postMessage({ op: 'cancel', id } satisfies ToAnalyzeWorker);
  });

  $('stAnCopy').addEventListener('click', async () => say((await copyText(out.value)) ? t('st.perfCopied') : t('st.perfCopyFail')));
  $('stAnCopyJson').addEventListener('click', async () => { if (json) say((await copyText(json)) ? t('st.perfCopied') : t('st.perfCopyFail')); });
  $('stAnSave').addEventListener('click', () => {
    if (!json) return;
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: analyzeName(name) }).click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
};
