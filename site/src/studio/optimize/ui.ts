import { t } from '../../i18n/i18n';
import { $ } from '../../player/dom';
import { copyText } from '../../player/snippet';
import { humanBytes } from '../../common/format';
import type { StudioSession } from '../session';

import type { FromOptimizeWorker, ToOptimizeWorker } from './protocol';

export const OPTIMIZE_HTML = `
<details class="st-fold" id="stOptimize">
  <summary><span data-i18n="st.opt"></span></summary>
  <p class="hint" data-i18n="st.optHint"></p>
  <div class="row">
    <label class="fld"><span data-i18n="st.optFps"></span><select id="stOptFps"><option>23.976</option><option selected>24</option><option>25</option><option>29.97</option><option>30</option><option>50</option><option>59.94</option><option>60</option></select></label>
    <label class="fld"><span data-i18n="st.optMode"></span>
      <select id="stOptMode"><option value="invisible" data-i18n="st.optInvisible"></option><option value="exact" data-i18n="st.optExact"></option><option value="loose" data-i18n="st.optLoose"></option></select></label>
    <button type="button" class="btn sm primary" id="stOptRun" data-i18n="st.optRun"></button>
    <button type="button" class="btn sm" id="stOptCancel" data-i18n="st.cancel" hidden></button>
  </div>
  <p class="hint" id="stOptStatus" role="status"></p>
  <pre class="code" id="stOptOut" hidden></pre>
  <div class="row" id="stOptDone" hidden>
    <button type="button" class="btn sm primary" id="stOptAdd" data-i18n="st.optAdd"></button>
    <button type="button" class="btn sm" id="stOptSave" data-i18n="st.optSave"></button>
    <button type="button" class="btn sm" id="stOptCopy" data-i18n="st.optCopy"></button>
  </div>
</details>`;

/** Largest script read into memory here; bigger ones go through the command line (`par optimize`). */
export const MAX_OPTIMIZE_BYTES = 120 * 1024 * 1024;

/** `name.ass` => `name.optimized.ass`. */
export const optimizedName = (name: string): string => `${name.replace(/\.(ass|ssa|txt)$/i, '')}.optimized.ass`;

interface Deps {
  session: () => StudioSession | null;
  add: (files: File[], select: boolean) => Promise<void>;
  /** Video fps the Studio is working at (null = unknown). */
  videoFps: () => number | null;
  status: (msg: string) => void;
}

/**
 * The optimizer: frame-by-frame runs of the selected ASS subtitle rewritten as `\move` / `\t` events (docs/optimize.md), in a Worker with
 * progress and cancel. The result goes onto the shelf as `<name>.optimized.ass` (it plays and sizes like any subtitle) or is downloaded.
 */
export const initOptimize = ({ session, add, videoFps }: Deps) => {
  const run = $<HTMLButtonElement>('stOptRun');
  const cancel = $<HTMLButtonElement>('stOptCancel');
  const say = (msg: string): void => { $('stOptStatus').textContent = msg; };
  const out = $('stOptOut');
  const done = $('stOptDone');
  const fpsSel = $<HTMLSelectElement>('stOptFps');
  let worker: Worker | null = null;
  let seq = 0;
  let result: { name: string; text: string } | null = null;

  const post = (m: ToOptimizeWorker): void => { (worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })).postMessage(m); };

  /** The select follows the video's frame rate when it is one of the choices. */
  const syncFps = (): void => {
    const v = videoFps();
    if (v !== null) { const o = [...fpsSel.options].find((x) => Math.abs(Number(x.value) - v) < 0.01); if (o) fpsSel.value = o.value; }
  };
  $('stOptimize').addEventListener('toggle', syncFps);

  run.addEventListener('click', async () => {
    const s = session();
    if (!s) { say(t('st.optNoSub')); return; }
    if (s.kind !== 'ass') { say(t('st.optNotAss')); return; }
    if (s.blob.size > MAX_OPTIMIZE_BYTES) { say(t('st.optBig', { size: humanBytes(s.blob.size) })); return; }
    const id = ++seq;
    run.hidden = true; cancel.hidden = false; done.hidden = true; out.hidden = true; result = null;
    say(t('st.optReading'));
    const text = await s.blob.text();
    if (id !== seq) return;
    const w = (worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }));
    const onMsg = (e: MessageEvent<FromOptimizeWorker>): void => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.op === 'progress') { say(t('st.optRunning', { pct: Math.round(m.fraction * 100) })); return; }
      w.removeEventListener('message', onMsg);
      run.hidden = false; cancel.hidden = true;
      if (m.op === 'error') { say(m.aborted ? t('st.cancelled') : t('st.fail', { error: m.message })); return; }
      const st = m.stats;
      const pct = st.eventsIn ? ((1 - st.eventsOut / st.eventsIn) * 100).toFixed(1) : '0';
      result = { name: optimizedName(s.name), text: m.text };
      out.textContent = t('st.optResult', { a: st.eventsIn.toLocaleString('en-US'), b: st.eventsOut.toLocaleString('en-US'), pct, size0: humanBytes(text.length), size1: humanBytes(m.text.length), chains: st.chains, merged: st.merged, rej: st.rejected, ord: st.orderConflicts, err: Math.round(st.worstError * 100), s: (m.ms / 1000).toFixed(1) });
      out.hidden = false;
      done.hidden = st.merged === 0;
      say(st.merged === 0 ? t('st.optNothing') : t('st.optDone'));
    };
    w.addEventListener('message', onMsg);
    post({ op: 'run', id, text, fps: Number(fpsSel.value), mode: $<HTMLSelectElement>('stOptMode').value as 'exact' });
    cancel.onclick = () => { post({ op: 'cancel', id }); };
  });

  $('stOptAdd').addEventListener('click', () => { if (result) void add([new File([result.text], result.name, { type: 'text/plain' })], true); });
  $('stOptSave').addEventListener('click', () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.text], { type: 'text/plain' }));
    Object.assign(document.createElement('a'), { href: url, download: result.name }).click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('stOptCopy').addEventListener('click', async () => { if (out.textContent) say((await copyText(out.textContent)) ? t('st.perfCopied') : t('st.perfCopyFail')); });
  return { sync: syncFps };
};
