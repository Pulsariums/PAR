import type { SubtitleSource } from '../../../src/source';
import { t } from '../i18n/i18n';

import { $ } from './dom';
import { humanBytes } from './labFormat';
import { openSession } from './labOpen';
import type { SizeClient } from './labSizeClient';
import type { LabSession } from './labTypes';

const kindKey = { ass: 'lab.k.ass', xpar: 'lab.k.xpar', par: 'lab.k.par' } as const;

export interface LoadHooks {
  /** A file is ready: it replaces the previous session. */
  ready(s: LabSession): void;
  /** Loading started (before the first progress). */
  begin(): void;
}

/** File picker / drop / generator: opens a Blob in the source Worker with a progress bar and a cancel button. */
export const initLabLoad = (client: SizeClient, hooks: LoadHooks) => {
  const status = $<HTMLParagraphElement>('labStatus');
  const box = $('labProgress');
  const bar = $('labProgressBar');
  const meter = box.querySelector<HTMLElement>('[role=progressbar]')!;
  let abort: AbortController | null = null;
  let cancelGen: (() => void) | null = null;
  let current: SubtitleSource | null = null;

  const progress = (pct: number | null, text: string): void => {
    box.hidden = pct === null;
    bar.style.width = `${pct ?? 0}%`;
    meter.setAttribute('aria-valuenow', String(pct ?? 0));
    if (text) status.textContent = text;
  };
  const stop = (): void => { abort?.abort(); abort = null; cancelGen?.(); cancelGen = null; };

  const open = async (blob: Blob, name: string): Promise<void> => {
    stop();
    hooks.begin();
    const ac = new AbortController();
    abort = ac;
    const t0 = performance.now();
    progress(0, t('lab.reading', { name }));
    try {
      const session = await openSession(blob, name, {
        signal: ac.signal,
        onProgress: (done, total) => progress(Math.round((done / Math.max(1, total)) * 100), t('lab.prog', { pct: Math.round((done / Math.max(1, total)) * 100), done: humanBytes(done), total: humanBytes(total) })),
      });
      current?.close?.();
      current = session.source;
      progress(null, t('lab.ready', { name, kind: t(kindKey[session.kind]), ms: Math.round(performance.now() - t0) }));
      hooks.ready(session);
    } catch (e) {
      progress(null, ac.signal.aborted ? t('lab.cancelled') : t('lab.fail', { error: e instanceof Error ? e.message.replace(/^xpar: /, '') : String(e) }));
    }
  };

  $('labCancel').addEventListener('click', () => { stop(); progress(null, t('lab.cancelled')); });
  $('labPick').addEventListener('click', () => $<HTMLInputElement>('labFile').click());
  $<HTMLInputElement>('labFile').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) void open(f, f.name);
  });
  $('labGen').addEventListener('click', () => {
    stop();
    const mb = Number($<HTMLSelectElement>('labGenSize').value);
    progress(0, t('lab.generating', { size: `${mb} MB` }));
    const job = client.generate(mb * 1024 * 1024, (f) => progress(Math.round((f ?? 0) * 100), ''));
    cancelGen = job.cancel;
    void job.promise.then((r) => { cancelGen = null; void open(r.blob, `generated-${mb}MB.ass`); });
  });

  return { open };
};
