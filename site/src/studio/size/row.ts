import { el } from '../../playground/dom';

export interface RowState {
  /** Headline: the size (exact or estimated). */
  text: string;
  /** "6.2% of the ASS". */
  ratio?: string;
  /** 0..100 while a job runs, null otherwise. */
  busy: number | null;
  error?: string;
  note?: string;
  runLabel: string;
  cancelLabel: string;
  canRun: boolean;
  dlLabel: string;
  canDownload: boolean;
  /** Estimate shown (draw it muted). */
  estimate?: boolean;
}

/** One result row of the size panel: value, ratio chip, progress, "compute exactly" / cancel, download. Everything always visible. */
export class SizeRow {
  readonly root = el('div', 'st-sizerow');
  readonly head = el('div', 'st-sizehead');
  private readonly value = el('span', 'mono st-sizeval');
  private readonly chip = el('span', 'status approx');
  private readonly bar = el('div', 'qbar');
  private readonly fill = el('i');
  private readonly note = el('p', 'hint');
  private readonly run = el('button', 'btn sm');
  private readonly dl = el('button', 'btn sm');
  private busy = false;

  constructor(title: Node, onRun: () => void, onCancel: () => void, onDownload: () => void) {
    this.run.type = this.dl.type = 'button';
    this.bar.setAttribute('role', 'progressbar');
    this.bar.append(this.fill);
    this.run.addEventListener('click', () => (this.busy ? onCancel() : onRun()));
    this.dl.addEventListener('click', onDownload);
    const acts = el('div', 'row st-sizeacts');
    acts.append(this.run, this.dl);
    this.head.append(title, this.chip);
    this.root.append(this.head, this.value, this.bar, this.note, acts);
  }

  show(s: RowState): void {
    this.busy = s.busy !== null;
    this.value.textContent = s.error ?? s.text;
    this.value.classList.toggle('muted', !!s.estimate);
    this.value.classList.toggle('err', !!s.error);
    this.chip.textContent = s.ratio ?? '';
    this.chip.hidden = !s.ratio;
    this.bar.hidden = s.busy === null;
    this.bar.setAttribute('aria-valuenow', String(s.busy ?? 0));
    this.fill.style.width = `${s.busy ?? 0}%`;
    this.note.textContent = s.note ?? '';
    this.note.hidden = !s.note;
    this.run.textContent = this.busy ? s.cancelLabel : s.runLabel;
    this.run.disabled = !this.busy && !s.canRun;
    this.dl.textContent = s.dlLabel;
    this.dl.disabled = !s.canDownload;
  }
}
