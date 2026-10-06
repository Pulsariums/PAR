import type { FontLibrary } from '../../../src/fontlib';
import { usedCharacters } from '../../../src/index';
import { onLang, t } from '../i18n/i18n';

import { $, bytesLabel, button, el } from './dom';
import type { LibList as ListClass } from './libList';
import { askEnabled, initMissingPrompt, setAsk } from './missingUi';
import type { Player } from './player';

const FONT_ACCEPT = '.ttf,.otf,.ttc,.otc,.woff,.woff2,.zip';

/**
 * Fonts tab, "Font library" section: the user's own persistent font store (IndexedDB, loaded as a separate chunk), wired to
 * the renderer as a font provider. Add / list / search / group / select / delete / names / export, storage use with a
 * quota warning, the persistence request, per-font previews and character grids, and the "font is missing" prompt.
 */
export const initFontLib = (player: Player, selectTab: (id: string) => void): void => {
  const root = $('fontLib');
  let lib: FontLibrary | null = null;
  let list: InstanceType<typeof ListClass> | null = null;
  let ListCtor: typeof ListClass | null = null;
  let custom = '';
  let message = '';
  let fatal = '';
  const picker = Object.assign(el('input'), { type: 'file', multiple: true, accept: FONT_ACCEPT, hidden: true });
  const previewText = (): string => custom || t('lib.sample');
  const addFonts = (): void => { selectTab('fonts'); picker.click(); };
  initMissingPrompt(player, addFonts);

  const shell = (): void => {
    const head = el('div', 'row');
    head.append(button(t('lib.add'), () => picker.click(), 'btn sm primary'), button(t('lib.persist'), () => void persist()), button(t('lib.export'), () => void exportZip()));
    for (const b of head.querySelectorAll('button')) b.disabled = !lib;
    const ask = Object.assign(el('input'), { type: 'checkbox', checked: askEnabled() });
    ask.addEventListener('change', () => setAsk(ask.checked));
    const askLabel = el('label', 'chk');
    askLabel.append(ask, el('span', '', t('lib.askMissing')));
    const text = Object.assign(el('input'), { type: 'text', value: custom, placeholder: t('lib.sample') });
    text.setAttribute('aria-label', t('lib.previewText'));
    text.addEventListener('input', () => { custom = text.value; list?.draw(); });
    const field = el('label', 'fld grow', t('lib.previewText'));
    field.append(text);
    const reset = button(t('lib.previewReset'), () => { custom = ''; shell(); list?.draw(); });
    const pv = el('div', 'row');
    pv.append(field, reset);
    const host = el('div');
    list = lib && ListCtor ? new ListCtor(host, lib, { lib, usedChars: () => usedCharacters(player.text), previewText, changed: () => void refresh() }) : null;
    const usage = el('div', 'libquota');
    usage.id = 'libUsage';
    root.replaceChildren(el('h3', 'sm', t('lib.title')), el('p', 'hint', t('lib.intro')), head, el('p', 'hint err', fatal), el('p', 'hint', message), usage, askLabel, pv, el('p', 'hint', t('lib.tofu')), host, picker);
    if (lib) void refresh();
  };

  const refresh = async (): Promise<void> => {
    if (!lib || !list) return;
    list.set(await lib.list());
    const u = await lib.usage();
    const box = $('libUsage');
    const lines = [t('lib.count', { n: u.count, size: bytesLabel(u.bytes) })];
    if (u.quota !== null && u.used !== null) lines.push(t('lib.quota', { used: bytesLabel(u.used), quota: bytesLabel(u.quota) }));
    else lines.push(t('lib.quotaUnknown'));
    if (u.persisted) lines.push(t('lib.persisted'));
    const bar = el('div', 'qbar');
    bar.setAttribute('role', 'meter');
    bar.setAttribute('aria-label', t('lib.usage'));
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', String(Math.round((u.ratio ?? 0) * 100)));
    bar.append(Object.assign(el('i'), { style: `width:${Math.min(100, Math.round((u.ratio ?? 0) * 100))}%` }));
    box.className = `libquota${u.warn ? ' warn' : ''}`;
    box.replaceChildren(...(u.quota !== null ? [bar] : []), el('p', 'hint', lines.join(' | ')), ...(u.warn ? [el('p', 'hint err', t('lib.quotaWarn'))] : []));
  };

  const persist = async (): Promise<void> => {
    message = (await lib?.requestPersistence()) ? t('lib.persisted') : t('lib.persistDenied');
    shell();
  };

  const exportZip = async (): Promise<void> => {
    if (!lib) return;
    const url = URL.createObjectURL(await lib.exportZip());
    Object.assign(document.createElement('a'), { href: url, download: 'par-font-library.zip' }).click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  picker.addEventListener('change', async () => {
    const files = Array.from(picker.files ?? []);
    picker.value = '';
    if (!lib || !files.length) return;
    const res = await lib.add(files);
    void lib.requestPersistence(); // a user gesture just happened: the best moment to ask the browser not to evict the fonts
    message = [t('lib.added', { n: res.added.length, d: res.duplicates.length }), ...res.errors.map((e) => t('lib.addError', { name: e.name, error: e.error }))].join(' ');
    shell();
  });

  onLang(shell);
  shell();
  void (async () => {
    try {
      // the library and its UI are separate chunks: nothing is downloaded until the playground opens
      const [ui, shared] = await Promise.all([import('./libList'), import('./libShared')]);
      ListCtor = ui.LibList;
      lib = await shared.getLibrary();
      lib.onChange(() => void refresh());
      player.par.setOptions({ fontProviders: [lib.asProvider()] });
    } catch {
      fatal = t('lib.unavailable');
    }
    shell();
  })();
};
