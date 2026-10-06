import { sniffBlob } from '../../../src/source';
import { t } from '../i18n/i18n';
import { humanBytes } from '../common/format';
import { openSession } from './openSession';
import type { StudioSession } from './session';
import type { Player } from '../playground/player';

import type { SubKind } from './exportPlan';
import { Shelf, newId } from './shelfState';
import { createShelf } from './shelfView';

export interface SubItem { id: string; name: string; size: number; kind: SubKind; file: File; error: string }
const BADGE: Record<SubKind, string> = { ass: 'ASS', xpar: 'XPAR', par: 'PAR' };

/** Subtitles shelf (.ass .ssa .xpar .par, sniffed from the content). Selecting opens the file in the source Worker and swaps only the subtitle: the video keeps playing. */
export const initSubShelf = (host: HTMLElement, player: Player, hooks: { session(s: StudioSession | null): void; status(msg: string): void }) => {
  const shelf = new Shelf<SubItem>();
  let applied: string | null = null;
  let abort: AbortController | null = null;
  const view = createShelf(host, {
    title: 'st.subs', empty: 'st.emptyS', accept: '.ass,.ssa,.xpar,.par,.txt', selectable: true,
    onFiles: (files) => void add(files),
    onSelect: (id) => { shelf.select(id); },
    onRemove: (id) => { shelf.remove(id); },
  });
  const draw = (): void => view.render(shelf.items.map((s) => ({ id: s.id, name: s.name, meta: humanBytes(s.size), badge: BADGE[s.kind], error: s.error, selected: s.id === shelf.selectedId })));

  async function add(files: File[], select = false): Promise<void> {
    const items: SubItem[] = [];
    for (const file of files) {
      const kind = await sniffBlob(file).catch(() => 'unknown' as const);
      if (kind === 'unknown') hooks.status(t('st.subBad', { name: file.name }));
      else items.push({ id: newId('s'), name: file.name, size: file.size, kind, file, error: '' });
    }
    shelf.add(items);
    if (select && items.length) shelf.select(items[0]!.id);
  }

  const apply = (): void => {
    const cur = shelf.selected;
    if ((cur?.id ?? null) === applied) return;
    applied = cur?.id ?? null;
    abort?.abort();
    if (!cur) { abort = null; player.text = ''; player.par.setSubtitle(null); hooks.session(null); hooks.status(''); return; }
    const ac = (abort = new AbortController());
    hooks.session(null);
    hooks.status(t('st.reading', { name: cur.name }));
    openSession(cur.file, cur.name, { signal: ac.signal, onProgress: (d, n) => hooks.status(t('st.prog', { pct: Math.round((d / Math.max(1, n)) * 100), done: humanBytes(d), total: humanBytes(n) })) }).then((s) => {
      if (ac.signal.aborted) { s.source.close?.(); return; }
      player.setSource(s.source);
      hooks.session(s);
      hooks.status(t('st.subReady', { name: cur.name, n: s.source.eventCount.toLocaleString('en-US') }));
    }, (e: unknown) => {
      if (ac.signal.aborted) return;
      cur.error = e instanceof Error ? e.message : String(e);
      hooks.status(t('st.fail', { error: cur.error }));
      draw();
    });
  };

  shelf.subscribe(() => { apply(); draw(); });
  return { render: draw, add };
};
