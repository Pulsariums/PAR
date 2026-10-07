import { el } from './dom';

/** Render-rate snap marks (same as the Options tab). */
export const RENDER_MARKS = [12, 24, 30, 45, 60, 75, 120];
/** PAR target fps choices of the size panel. */
export const PAR_MARKS = [12, 24, 30, 45, 60, 75, 120];
/** Frame rates of video (NTSC ones are exact fractions in PAR, see `frameRate`). */
export const VIDEO_MARKS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];

export interface Chips {
  root: HTMLElement;
  set(v: number | null): void;
}

/** A row of toggle chips plus a "custom" number field; `onPick` gets a positive number. Always visible, touch sized. */
export const fpsChips = (marks: number[], customLabel: string, onPick: (v: number) => void, initial: number | null): Chips => {
  const root = el('div', 'marks');
  const chips = marks.map((m) => {
    const b = el('button', 'chip sm', String(m));
    b.type = 'button';
    b.addEventListener('click', () => onPick(m));
    return b;
  });
  const input = Object.assign(el('input', 'fps-custom'), { type: 'number', min: '1', max: '1000', step: '0.001', inputMode: 'decimal', placeholder: customLabel });
  input.setAttribute('aria-label', customLabel);
  input.dataset.i18nAttr = 'placeholder:lab.s.custom,aria-label:lab.s.custom';
  input.addEventListener('change', () => { const v = Number(input.value); if (Number.isFinite(v) && v >= 1 && v <= 1000) onPick(v); });
  root.append(...chips, input);
  const set = (v: number | null): void => {
    chips.forEach((c, i) => c.setAttribute('aria-pressed', String(v !== null && marks[i] === v)));
    input.value = v !== null && !marks.includes(v) ? String(v) : '';
  };
  set(initial);
  return { root, set };
};
