import { t } from '../i18n/i18n';
import type { Dict } from '../i18n/en';
import { button, el } from '../playground/dom';
import { humanBytes } from '../playground/labFormat';
import { download } from '../playground/labSizeJobs';

import { actionsFor, ratioPct, type Action } from './plan';
import type { Item } from './queue';

export interface RowHandlers {
  run(id: number, action: Action): void;
  cancel(id: number): void;
  remove(id: number): void;
}

const LABEL: Record<Action, keyof Dict> = { xpar: 'cv.toXpar', par: 'cv.toPar', ass: 'cv.toAss' };

/** One file of the queue. Built once, then `update` rewrites texts and visibility (no rebuild, so keyboard focus survives progress ticks). */
export class Row {
  readonly root = el('li', 'cv-row');
  private readonly name = el('b', 'cv-name');
  private readonly meta = el('span', 'muted cv-meta');
  private readonly acts = el('div', 'cv-acts');
  private readonly btns = new Map<Action, HTMLButtonElement>();
  private readonly busy = el('div', 'cv-busy');
  private readonly bar = el('div', 'cv-bar');
  private readonly fill = el('i');
  private readonly busyText = el('span', 'cv-btext');
  private readonly cancel: HTMLButtonElement;
  private readonly out = el('div', 'cv-out');
  private readonly outText = el('span', 'cv-otext');
  private readonly dl: HTMLButtonElement;
  private readonly note = el('p', 'hint cv-note');
  private readonly rm: HTMLButtonElement;
  private blob: { blob: Blob; name: string } | null = null;

  constructor(private id: number, h: RowHandlers) {
    for (const a of ['xpar', 'par', 'ass'] as const) {
      const b = button('', () => h.run(this.id, a), 'btn sm');
      this.btns.set(a, b);
    }
    this.acts.append(...this.btns.values());
    this.bar.setAttribute('role', 'progressbar');
    this.bar.setAttribute('aria-valuemin', '0');
    this.bar.setAttribute('aria-valuemax', '100');
    this.bar.append(this.fill);
    this.cancel = button('', () => h.cancel(this.id));
    this.busy.append(this.bar, this.busyText, this.cancel);
    this.dl = button('', () => { if (this.blob) download(this.blob.blob, this.blob.name); }, 'btn sm primary');
    this.out.append(this.dl, this.outText);
    this.rm = button('', () => h.remove(this.id), 'btn sm cv-rm');
    const head = el('div', 'cv-head');
    head.append(this.name, this.meta, this.rm);
    this.root.append(head, this.acts, this.busy, this.out, this.note);
  }

  update(it: Item): void {
    this.id = it.id;
    const idle = it.status === 'ready';
    this.name.textContent = it.name;
    this.name.title = it.name;
    this.meta.textContent = it.kind === 'unknown' ? humanBytes(it.size) : `${t(`cv.k.${it.kind}` as keyof Dict)}, ${humanBytes(it.size)}`;
    this.rm.textContent = t('cv.remove');
    this.rm.setAttribute('aria-label', t('cv.removeLabel', { name: it.name }));
    this.rm.disabled = it.status === 'running';
    this.acts.hidden = !(idle || it.status === 'done' || (it.status === 'error' && it.kind !== 'unknown' && it.size > 0));
    for (const [a, b] of this.btns) {
      b.hidden = !actionsFor(it.kind).includes(a);
      b.textContent = t(LABEL[a]);
      b.classList.toggle('primary', idle && a !== 'par');
      b.classList.toggle('on', it.status === 'done' && it.action === a);
    }
    this.updateBusy(it);
    this.updateOut(it);
  }

  private updateBusy(it: Item): void {
    const on = it.status === 'queued' || it.status === 'running';
    this.busy.hidden = !on;
    this.cancel.textContent = t('cv.cancel');
    if (!on) return;
    const phase = t(it.status === 'queued' ? 'cv.ph.queued' : it.phase === 'verify' ? 'cv.ph.verify' : 'cv.ph.encode');
    const pct = it.progress === null ? null : Math.round(it.progress * 100);
    this.busyText.textContent = it.status === 'queued' ? phase : pct === null ? t('cv.busyNoPct', { phase }) : t('cv.busy', { phase, pct });
    this.fill.style.width = `${pct ?? 100}%`;
    this.bar.classList.toggle('indet', pct === null && it.status === 'running');
    if (pct === null) this.bar.removeAttribute('aria-valuenow'); else this.bar.setAttribute('aria-valuenow', String(pct));
    this.bar.setAttribute('aria-label', phase);
  }

  private updateOut(it: Item): void {
    const r = it.result;
    this.blob = r ? { blob: r.blob, name: it.outName } : null;
    this.out.hidden = it.status !== 'done' || !r;
    let note = '';
    if (it.status === 'error') note = it.error || (it.size === 0 ? t('cv.err.empty') : t('cv.err.unknown'));
    if (it.status === 'done' && r && it.action) {
      this.dl.textContent = `${t('cv.download')} ${it.outName}`;
      this.dl.setAttribute('aria-label', t('cv.downloadLabel', { name: it.outName }));
      this.outText.textContent = t('cv.done', { input: humanBytes(it.size), output: humanBytes(r.blob.size), ratio: ratioPct(r.blob.size, it.size), s: (r.ms / 1000).toFixed(r.ms < 10000 ? 2 : 1) });
      note = it.action === 'par' ? t('cv.parOut', { fps: it.fps, m: r.notes?.merged ?? 0, d: r.notes?.dropped ?? 0, c: r.notes?.collapsed ?? 0 })
        : it.action === 'xpar' ? (r.verified === 'ok' ? t('cv.verified') : '')
          : it.kind === 'par' ? t('cv.parNote') : t('cv.checked');
    }
    this.note.hidden = !note;
    this.note.textContent = note;
    this.note.classList.toggle('err', it.status === 'error');
    this.note.classList.toggle('warn', it.status === 'done' && it.kind === 'par');
  }
}
