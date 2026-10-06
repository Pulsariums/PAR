import { t } from '../i18n/i18n';
import type { Dict } from '../i18n/en';
import { button, el } from '../playground/dom';

export interface Row {
  id: string;
  name: string;
  /** "ASS", "XPAR", "12.4 MB" ... shown small under the name. */
  meta: string;
  /** Small status chip (kind, "in use"). */
  badge?: string;
  error?: string;
  selected?: boolean;
}

export interface ShelfOptions {
  title: keyof Dict;
  empty: keyof Dict;
  accept: string;
  /** Rows can be made the active one (videos, subtitles); fonts are all active at once. */
  selectable: boolean;
  onFiles(files: File[]): void;
  onSelect?(id: string): void;
  onRemove(id: string): void;
}

/** One shelf: header with count and an always visible "Add" button (file picker, several files), list with select and remove buttons. */
export const createShelf = (host: HTMLElement, o: ShelfOptions) => {
  const h = el('h3', 'st-h');
  const count = el('span', 'mono muted');
  const input = Object.assign(el('input'), { type: 'file', multiple: true, accept: o.accept, hidden: true });
  const add = el('button', 'btn sm primary');
  add.type = 'button';
  add.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { const f = Array.from(input.files ?? []); input.value = ''; if (f.length) o.onFiles(f); });
  const head = el('div', 'st-head');
  const title = el('span');
  h.append(title, count);
  head.append(h, add, input);
  const list = el('ul', 'st-list');
  const empty = el('p', 'hint');
  host.append(head, list, empty);
  let rows: Row[] = [];

  const item = (r: Row): HTMLElement => {
    const li = el('li', `st-item${r.selected ? ' on' : ''}`);
    const body = el('span', 'st-body');
    const name = el('span', 'st-name', r.name);
    name.title = r.name;
    const meta = el('span', 'st-meta mono', r.meta);
    if (r.badge) meta.prepend(el('b', 'status approx', r.badge), ' ');
    body.append(name, meta);
    if (r.error) body.append(el('span', 'st-err', r.error));
    const main = o.selectable ? button('', () => o.onSelect?.(r.id), 'st-pick') : el('div', 'st-pick static');
    if (o.selectable) { main.setAttribute('aria-pressed', String(!!r.selected)); main.title = t('st.select'); }
    main.append(body);
    const rm = button('x', () => o.onRemove(r.id), 'btn sm st-rm');
    rm.setAttribute('aria-label', `${t('st.remove')}: ${r.name}`);
    rm.title = t('st.remove');
    li.append(main, rm);
    return li;
  };

  return {
    render(next: Row[] = rows): void {
      rows = next;
      title.textContent = t(o.title);
      count.textContent = String(rows.length);
      add.textContent = t('st.add');
      add.setAttribute('aria-label', `${t('st.add')}: ${t(o.title)}`);
      list.replaceChildren(...rows.map(item));
      empty.textContent = t(o.empty);
      empty.hidden = rows.length > 0;
    },
    pick: (): void => input.click(),
  };
};
