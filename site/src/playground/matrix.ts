import { onLang, t } from '../i18n/i18n';

import { FEATURES, type Status } from './features';

const KEY: Record<Status, 'st.rendered' | 'st.approx' | 'st.unsupported'> = {
  rendered: 'st.rendered',
  approx: 'st.approx',
  unsupported: 'st.unsupported',
};

/** Feature test matrix: every row loads its preset; status chips are text, not colour only. */
export const initMatrix = (onTest: (presetId: string) => void) => {
  const ul = document.getElementById('matrix') as HTMLUListElement;
  const render = () => {
    ul.innerHTML = FEATURES.map(
      (f, i) => `<li><code>${f.label.replace(/</g, '&lt;')}</code><span class="status ${f.status}">${t(KEY[f.status])}</span>` +
        `<button type="button" class="btn sm" data-i="${i}">${t('mx.test')}</button></li>`,
    ).join('');
  };
  ul.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-i]');
    if (b) onTest(FEATURES[Number(b.dataset.i)].preset);
  });
  onLang(render);
  render();
};
