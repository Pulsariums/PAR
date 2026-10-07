import type { FontLibrary, FontRecord } from '../../../src/fontlib';
import { t } from '../i18n/i18n';
import { humanBytes } from '../common/format';
import type { Player } from '../player/player';

import { createShelf } from './shelfView';

const variant = (r: FontRecord): string => (r.weight >= 600 ? (r.italic ? 'Bold Italic' : 'Bold') : r.italic ? 'Italic' : 'Regular');

/** Fonts shelf: the user's persistent font library (IndexedDB, shared with the Lab and playground). Every font is active; those the selected subtitle's styles name are marked. */
export const initFontShelf = (host: HTMLElement, player: Player, status: (msg: string) => void) => {
  let lib: FontLibrary | null = null;
  let records: FontRecord[] = [];
  let used = new Set<string>();
  const view = createShelf(host, {
    title: 'st.fonts', empty: 'st.emptyF', accept: '.ttf,.otf,.ttc,.otc,.woff,.woff2,.zip', selectable: false,
    onFiles: (files) => void add(files),
    onRemove: (id) => void lib?.remove(id),
  });
  const draw = (): void => view.render(records.map((r) => ({
    id: r.id, name: r.family, meta: `${variant(r)} - ${humanBytes(r.size)}`,
    badge: used.has(r.family.toLowerCase()) || r.families.some((f) => used.has(f.toLowerCase())) ? t('st.used') : undefined,
  })));

  async function add(files: File[]): Promise<void> {
    if (!lib) return;
    const res = await lib.add(files);
    void lib.requestPersistence();
    status(res.errors.length ? t('st.fontsErr', { n: res.added.length, e: res.errors.map((e) => `${e.name}: ${e.error}`).join('; ') }) : t('st.fontsAdded', { n: res.added.length }));
  }

  void import('../player/libShared').then((m) => m.getLibrary()).then(async (l) => {
    lib = l;
    player.par.setOptions({ fontProviders: [l.asProvider()] });
    const load = (): void => void l.list().then((r) => { records = r.sort((a, b) => a.family.localeCompare(b.family)); draw(); });
    l.onChange(load);
    load();
  }).catch((e: unknown) => status(t('st.fail', { error: e instanceof Error ? e.message : String(e) })));

  return {
    render: draw,
    add,
    pick: view.pick,
    /** Marks the fonts a subtitle's styles name. */
    setUsed(families: readonly string[]): void { used = new Set(families.map((f) => f.toLowerCase())); draw(); },
  };
};
