import { getLang, onLang, t } from '../i18n/i18n';
import { hintFor } from '../i18n/hints';
import { PRESETS, presetById } from '../presets';

import type { Player } from './player';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const DEBOUNCE_MS = 250;

/** Subtitle editor: live textarea, file loader and the preset gallery. */
export const initSubs = (player: Player, onChange: () => void) => {
  const area = $<HTMLTextAreaElement>('assText');
  const status = $<HTMLParagraphElement>('subStatus');
  const hint = $<HTMLParagraphElement>('presetHint');
  const list = $<HTMLDivElement>('presetList');
  let timer = 0;
  let current = '';

  const stats = () => {
    const s = player.par.script;
    status.textContent = s ? t('sub.stats', { events: s.events.length, styles: s.styles.size, warnings: s.warnings.length }) : '';
    status.title = s?.warnings.slice(0, 5).join('\n') ?? '';
  };
  const commit = () => { player.setSubtitle(area.value); stats(); onChange(); };
  const writeHint = () => { hint.textContent = current ? hintFor(current, getLang()) : ''; };

  area.addEventListener('input', () => {
    current = '';
    writeHint();
    window.clearTimeout(timer);
    timer = window.setTimeout(commit, DEBOUNCE_MS);
  });

  const setPreset = (id: string) => {
    const p = presetById(id);
    if (!p) return;
    current = id;
    area.value = p.ass;
    window.clearTimeout(timer);
    commit();
    player.card.seek(0);
    list.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === id)));
    writeHint();
  };
  const setText = (text: string, name: string) => {
    current = '';
    area.value = text;
    commit();
    list.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    writeHint();
    status.textContent = `${t('sub.loaded', { name })} | ${status.textContent}`;
  };

  list.innerHTML = PRESETS.map((p) => `<button type="button" class="chip" data-preset="${p.id}" aria-pressed="false">${p.title}</button>`).join('');
  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-preset]');
    if (b) setPreset(b.dataset.preset!);
  });
  const loadFile = async (file: File) => setText(await file.text(), file.name);
  $<HTMLInputElement>('assFile').addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) void loadFile(f);
  });
  onLang(() => { stats(); writeHint(); });
  return { setPreset, loadFile, text: () => area.value };
};
