import { t } from '../i18n/i18n';

import type { Player } from './player';
import type { Source, Store } from './store';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Video source switcher: test card, local file (picker or drop) or URL. */
export const initSource = (player: Player, store: Store, onChange: () => void) => {
  const status = $<HTMLParagraphElement>('srcStatus');
  const hint = $<HTMLParagraphElement>('srcHint');
  const btns = document.querySelectorAll<HTMLButtonElement>('[data-src]');
  let objectUrl = '';

  const show = (src: Source) => {
    btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.src === src)));
    $('srcFile').hidden = src !== 'file';
    $('srcUrl').hidden = src !== 'url';
    hint.hidden = src !== 'card';
  };
  const revoke = () => { if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = ''; } };

  const toCard = () => {
    revoke();
    player.useCard();
    status.textContent = '';
    store.patch({ source: 'card' });
    onChange();
  };
  const load = (src: string, name: string, source: Source) => {
    status.textContent = '';
    player.video.onerror = () => { status.textContent = t('src.error'); };
    player.useVideo(src);
    status.textContent = t('src.loaded', { name });
    store.patch({ source });
    onChange();
  };

  btns.forEach((b) => b.addEventListener('click', () => {
    const src = b.dataset.src as Source;
    show(src);
    if (src === 'card') toCard();
  }));

  const loadFile = (file: File) => {
    revoke();
    objectUrl = URL.createObjectURL(file);
    show('file');
    load(objectUrl, file.name, 'file');
  };
  $<HTMLInputElement>('videoFile').addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) loadFile(f);
  });
  $('videoUrlGo').addEventListener('click', () => {
    const url = $<HTMLInputElement>('videoUrl').value.trim();
    if (!url) return;
    revoke();
    load(url, url, 'url');
  });
  show('card');
  return { loadFile, show };
};
