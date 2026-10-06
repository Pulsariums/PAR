import { t } from '../../i18n/i18n';

import { el } from '../../playground/dom';
import { download } from '../../common/download';
import { exportName } from '../../common/exportName';
import { humanBytes, percent } from '../../common/format';
import type { JobKind, SizeResult } from './protocol';
import { JobCancelled, type Job, type SizeClient } from './client';
import { SizeRow, type RowState } from './row';
import type { StudioSession } from '../session';

/** Files up to this size are encoded for real right away; bigger ones are estimated from samples first. */
export const AUTO_EXACT_BYTES = 8 * 1024 * 1024;
/** Encoding speed of the own coder on a typical machine (docs/formats/XPAR.md), bytes of source per second: only for the "about N s" hint. */
const SPEED = 2.5 * 1024 * 1024;

interface State {
  est: SizeResult | null;
  exact: SizeResult | null;
  busy: number | null;
  error: string;
  job: Job<SizeResult> | null;
}
const blank = (): State => ({ est: null, exact: null, busy: null, error: '', job: null });

/** Runs the XPAR and PAR size jobs of one ASS file and keeps their two rows up to date. */
export class SizeJobs {
  readonly big: boolean;
  readonly xparRow: SizeRow;
  readonly parRow: SizeRow;
  private readonly st: Record<'xpar' | 'par', State> = { xpar: blank(), par: blank() };
  private timer = 0;
  private dead = false;

  constructor(private readonly client: SizeClient, private readonly s: StudioSession, private readonly fps: () => number, private readonly dlLabel?: (k: 'xpar' | 'par', fps: number) => string) {
    this.big = s.blob.size > AUTO_EXACT_BYTES;
    const title = (key: 'st.s.xpar' | 'st.s.par'): HTMLElement => el('b', '', t(key));
    this.xparRow = new SizeRow(title('st.s.xpar'), () => this.exact('xpar'), () => this.cancel('xpar'), () => this.save('xpar'));
    this.parRow = new SizeRow(title('st.s.par'), () => this.exact('par'), () => this.cancel('par'), () => this.save('par'));
    this.draw('xpar');
    this.draw('par');
  }

  start(): void {
    this.client.open(this.s.blob);
    for (const k of ['xpar', 'par'] as const) void (this.big ? this.estimate(k) : this.exact(k));
  }

  setFps(): void {
    this.cancel('par');
    this.st.par = blank();
    this.draw('par');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void (this.big ? this.estimate('par') : this.exact('par')), 300);
  }

  dispose(): void {
    this.dead = true;
    window.clearTimeout(this.timer);
    this.cancel('xpar');
    this.cancel('par');
  }

  redraw(): void {
    this.draw('xpar');
    this.draw('par');
  }

  private cancel(k: 'xpar' | 'par'): void {
    const st = this.st[k];
    st.job?.cancel();
    st.job = null;
    st.busy = null;
    this.draw(k);
  }

  private async run(k: 'xpar' | 'par', kind: JobKind, isExact: boolean): Promise<void> {
    this.cancel(k);
    const st = this.st[k];
    const fps = this.fps();
    st.error = '';
    st.busy = 0;
    const job = this.client.run(kind, fps, (f) => { st.busy = f === null ? 0 : Math.round(f * 100); this.draw(k); });
    st.job = job;
    this.draw(k);
    try {
      const r = await job.promise;
      if (this.dead || st.job !== job || (k === 'par' && fps !== this.fps())) return;
      if (isExact) st.exact = r; else st.est = r;
    } catch (e) {
      if (this.dead || st.job !== job || e instanceof JobCancelled) return;
      st.error = t('st.s.err', { error: e instanceof Error ? e.message : String(e) });
    }
    st.job = null;
    st.busy = null;
    this.draw(k);
  }

  private estimate(k: 'xpar' | 'par'): Promise<void> { return this.run(k, k === 'xpar' ? 'estXpar' : 'estPar', false); }
  private exact(k: 'xpar' | 'par'): Promise<void> { return this.run(k, k, true); }

  private save(k: 'xpar' | 'par'): void {
    const r = this.st[k].exact;
    if (!r?.blob) return;
    download(r.blob, exportName(k, this.s.name, this.fps()));
  }

  private draw(k: 'xpar' | 'par'): void {
    const st = this.st[k];
    const whole = this.s.blob.size;
    const r = st.exact ?? st.est;
    const secs = Math.max(1, Math.round(whole / SPEED));
    const state: RowState = {
      text: r ? (r.exact ? t('st.s.exact', { size: humanBytes(r.bytes), s: (r.ms / 1000).toFixed(1) }) : t('st.s.est', { size: humanBytes(r.bytes), low: humanBytes(r.low ?? r.bytes), high: humanBytes(r.high ?? r.bytes), pct: r.marginPct ?? 0 })) : t('st.s.est1'),
      ratio: r ? `${r.exact ? '' : '~'}${t('st.s.ratio', { pct: percent(r.bytes, whole) })}` : undefined,
      busy: st.busy, error: st.error || undefined, estimate: !!r && !r.exact,
      note: k === 'par' && r?.notes ? t('st.s.bake', { m: r.notes.merged, d: r.notes.dropped, c: r.notes.collapsed }) : undefined,
      runLabel: this.big ? t('st.s.runLong', { s: secs }) : t('st.s.run'), cancelLabel: t('st.cancel'),
      canRun: !st.exact, dlLabel: this.dlLabel?.(k, this.fps()) ?? (k === 'xpar' ? t('st.s.dlXpar') : t('st.s.dlPar', { fps: this.fps() })), canDownload: !!st.exact?.blob,
    };
    (k === 'xpar' ? this.xparRow : this.parRow).show(state);
  }
}
