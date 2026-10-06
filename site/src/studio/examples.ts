import { t } from '../i18n/i18n';
import { $, el } from '../playground/dom';
import { PRESETS, presetById } from '../presets';

import type { SizeClient } from './size/client';

const GEN_MB = [10, 100] as const;

/**
 * The "Examples" menu: the playground presets (one per feature, reused from presets/index.ts) and the large test-script generator.
 * Both end as an ordinary subtitle on the shelf, selected, so they play, export and size exactly like a file of your own.
 */
export const initExamples = (client: () => SizeClient, add: (files: File[], select: boolean) => Promise<void>, status: (msg: string) => void) => {
  const sel = $<HTMLSelectElement>('stExamples');
  const cancel = $<HTMLButtonElement>('stGenCancel');
  let stop: (() => void) | null = null;

  const render = (): void => {
    const presets = el('optgroup');
    presets.label = t('st.exPresets');
    presets.append(...PRESETS.map((p) => Object.assign(el('option'), { value: `p:${p.id}`, textContent: p.title })));
    const gen = el('optgroup');
    gen.label = t('st.exStress');
    gen.append(...GEN_MB.map((mb) => Object.assign(el('option'), { value: `g:${mb}`, textContent: t('st.gen', { size: `${mb} MB` }) })));
    sel.replaceChildren(Object.assign(el('option'), { value: '', textContent: t('st.exChoose') }), presets, gen);
  };

  const generate = (mb: number): void => {
    stop?.();
    sel.disabled = true;
    cancel.hidden = false;
    status(t('st.generating', { size: `${mb} MB`, pct: 0 }));
    const job = client().generate(mb * 1024 * 1024, (f) => status(t('st.generating', { size: `${mb} MB`, pct: Math.round((f ?? 0) * 100) })));
    const done = (): void => { stop = null; sel.disabled = false; cancel.hidden = true; };
    stop = (): void => { job.cancel(); done(); };
    void job.promise.then((r) => { done(); return add([new File([r.blob], `generated-${mb}MB.ass`)], true); }, () => done());
  };

  sel.addEventListener('change', () => {
    const v = sel.value;
    sel.value = '';
    if (v.startsWith('p:')) {
      const p = presetById(v.slice(2));
      if (p) void add([new File([p.ass], `${p.id}.ass`)], true);
    } else if (v.startsWith('g:')) generate(Number(v.slice(2)));
  });
  cancel.addEventListener('click', () => { stop?.(); status(t('st.cancelled')); });
  render();
  return { render };
};
