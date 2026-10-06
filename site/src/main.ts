import { initHero } from './hero';
import { initI18n, onLang, t } from './i18n/i18n';
import type { Dict } from './i18n/en';
import { initPlayground } from './playground';
import { initTheme } from './theme';

/** Feature cards (texts live in the dictionaries: f1.t / f1.d ...). */
const ICONS = ['0', '</>', '▶', '≈', '=', '⏱', '▭', '!'];
const renderFeatures = () => {
  const grid = document.getElementById('featGrid') as HTMLElement;
  grid.innerHTML = ICONS.map((icon, i) => {
    const n = i + 1;
    return `<article class="card feat"><span class="ico" aria-hidden="true">${icon.replace('<', '&lt;').replace('>', '&gt;')}</span>` +
      `<h3>${t(`f${n}.t` as keyof Dict)}</h3><p>${t(`f${n}.d` as keyof Dict)}</p></article>`;
  }).join('');
};

initTheme();
initPlayground(document.getElementById('playground') as HTMLElement);
initI18n();
renderFeatures();
onLang(renderFeatures);
initHero();
