import type { FontLibrary, FontRecord } from '../../../src/fontlib';
import { t } from '../i18n/i18n';
import type { Dict } from '../i18n/en';

import { bytesLabel, button, el } from './dom';
import { buildDetail, type DetailDeps } from './libDetail';
import { dropFace, faceCoverage, faceFamily, renderPreview } from './libFace';

export interface ListDeps extends DetailDeps {
  /** Text to preview (the user's, or the language default). */
  previewText(): string;
  /** Called after fonts were removed or renamed. */
  changed(): void;
}

const variantLabel = (r: FontRecord): string => {
  const bold = r.weight >= 600;
  const base = bold && r.italic ? t('lib.v.boldItalic') : bold ? t('lib.v.bold') : r.italic ? t('lib.v.italic') : t('lib.v.regular');
  return r.weight === 400 || r.weight === 700 ? base : `${base} (${r.weight})`;
};

const haystack = (r: FontRecord): string => [r.family, r.file, ...r.families, ...r.fullNames, ...r.aliases].join('\n').toLowerCase();

/** Library list: grouped by family (Regular / Bold / Italic under one heading), search, multi-select delete, names editor, lazy previews. */
export class LibList {
  private records: FontRecord[] = [];
  private filter = '';
  private readonly selected = new Set<string>();
  private open: string | null = null;
  private editing: string | null = null;
  private listHost: HTMLElement = el('div');
  private readonly seen = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { this.seen!.unobserve(e.target); (e.target as HTMLElement & { load?: () => void }).load?.(); } }))
    : null;

  constructor(private readonly root: HTMLElement, private readonly lib: FontLibrary, private readonly deps: ListDeps) {}

  set(records: FontRecord[]): void {
    this.records = records;
    const ids = new Set(records.map((r) => r.id));
    [...this.selected].forEach((id) => { if (!ids.has(id)) this.selected.delete(id); });
    this.draw();
  }

  /** Full redraw: toolbar and list. */
  draw(): void {
    const bar = this.bar(this.shown());
    this.listHost = el('div');
    this.root.replaceChildren(bar, this.listHost);
    this.drawList();
  }

  private shown(): FontRecord[] {
    return this.records.filter((r) => !this.filter || haystack(r).includes(this.filter));
  }

  /** Only the list (typing in the search box must not rebuild the box itself). */
  private drawList(): void {
    const shown = this.shown();
    const groups = new Map<string, FontRecord[]>();
    for (const r of shown) groups.set(r.family.toLowerCase(), [...(groups.get(r.family.toLowerCase()) ?? []), r]);
    const list = el('ul', 'fontlist liblist');
    for (const g of groups.values()) list.append(this.group(g));
    const empty = !this.records.length ? t('lib.empty') : !shown.length ? t('lib.noMatch') : '';
    this.listHost.replaceChildren(...(empty ? [el('p', 'hint', empty)] : [list]));
  }

  private bar(shown: FontRecord[]): HTMLElement {
    const bar = el('div', 'row libbar');
    const search = Object.assign(el('input'), { type: 'search', value: this.filter, placeholder: t('lib.search') });
    search.setAttribute('aria-label', t('lib.search'));
    search.addEventListener('input', () => { this.filter = search.value.trim().toLowerCase(); this.drawList(); });
    const all = Object.assign(el('input'), { type: 'checkbox', checked: shown.length > 0 && shown.every((r) => this.selected.has(r.id)), disabled: !shown.length });
    all.addEventListener('change', () => { shown.forEach((r) => (all.checked ? this.selected.add(r.id) : this.selected.delete(r.id))); this.draw(); });
    const chk = el('label', 'chk');
    chk.append(all, el('span', '', t('lib.selectAll')));
    const del = button(`${t('lib.deleteSel')} (${this.selected.size})`, () => void this.remove([...this.selected]));
    del.disabled = this.selected.size === 0;
    const clear = button(t('lib.clearSel'), () => { this.selected.clear(); this.draw(); });
    clear.disabled = this.selected.size === 0;
    bar.append(search, chk, del, clear);
    return bar;
  }

  private group(g: FontRecord[]): HTMLElement {
    const li = el('li', 'libgroup');
    const head = el('div', 'libhead');
    const box = Object.assign(el('input'), { type: 'checkbox', checked: g.every((r) => this.selected.has(r.id)) });
    box.setAttribute('aria-label', t('lib.selectGroup', { name: g[0].family }));
    box.addEventListener('change', () => { g.forEach((r) => (box.checked ? this.selected.add(r.id) : this.selected.delete(r.id))); this.draw(); });
    const scripts = [...new Set(g.flatMap((r) => r.scripts))];
    head.append(box, el('b', 'fname', g[0].family), el('span', 'fnote', `${t('lib.variants', { n: g.length })} | ${bytesLabel(g.reduce((s, r) => s + r.size, 0))}`));
    for (const s of scripts) { const b = el('span', 'status rendered', t(`script.${s}` as keyof Dict)); b.title = t('script.hint'); head.append(b); }
    li.append(head);
    for (const r of g) li.append(this.variant(r));
    return li;
  }

  private variant(r: FontRecord): HTMLElement {
    const row = el('div', 'libvar');
    const box = Object.assign(el('input'), { type: 'checkbox', checked: this.selected.has(r.id) });
    box.setAttribute('aria-label', t('lib.selectFont', { name: `${r.family} ${variantLabel(r)}` }));
    box.addEventListener('change', () => { if (box.checked) this.selected.add(r.id); else this.selected.delete(r.id); this.draw(); });
    const meta = el('span', 'fnote', [variantLabel(r), bytesLabel(r.size), t('lib.glyphsN', { n: r.glyphs }), r.aliases.length ? `+ ${r.aliases.join(', ')}` : ''].filter(Boolean).join(' | '));
    const actions = el('span', 'libact');
    actions.append(
      this.toggle(r),
      button(t('lib.names'), () => { this.editing = this.editing === r.id ? null : r.id; this.draw(); }),
      button(t('lib.remove'), () => void this.remove([r.id])),
    );
    const sample = el('div', 'libsample', ' ');
    Object.assign(sample, { load: () => void this.paint(r, sample) });
    this.seen ? this.seen.observe(sample) : void this.paint(r, sample);
    row.append(box, meta, actions, sample);
    if (this.editing === r.id) row.append(this.editor(r));
    if (this.open === r.id) row.append(buildDetail(r, this.deps));
    return row;
  }

  private toggle(r: FontRecord): HTMLButtonElement {
    const b = button(t('lib.preview'), () => { this.open = this.open === r.id ? null : r.id; this.drawList(); });
    b.setAttribute('aria-expanded', String(this.open === r.id));
    return b;
  }

  private async paint(r: FontRecord, target: HTMLElement): Promise<void> {
    const [family, cov] = await Promise.all([faceFamily(this.lib, r), faceCoverage(this.lib, r.id)]);
    renderPreview(target, this.deps.previewText(), cov, family);
    target.style.fontWeight = String(r.weight);
    target.style.fontStyle = r.italic ? 'italic' : 'normal';
  }

  private editor(r: FontRecord): HTMLElement {
    const form = el('form', 'libedit');
    const input = Object.assign(el('input'), { type: 'text', value: r.aliases.join(', ') });
    const label = el('label', 'fld', t('lib.namesLabel'));
    label.append(input);
    const save = Object.assign(button(t('lib.save'), () => {}, 'btn sm primary'), { type: 'submit' });
    form.append(label, el('p', 'hint', t('lib.namesHint')), el('div', 'row'));
    form.lastElementChild!.append(save, button(t('lib.cancel'), () => { this.editing = null; this.draw(); }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.lib.setAliases(r.id, input.value.split(',')).then(() => { this.editing = null; this.deps.changed(); });
    });
    return form;
  }

  private async remove(ids: string[]): Promise<void> {
    if (!ids.length || !window.confirm(t('lib.confirmDelete', { n: ids.length }))) return;
    await this.lib.remove(ids);
    ids.forEach((id) => { dropFace(id); this.selected.delete(id); if (this.open === id) this.open = null; });
    this.deps.changed();
  }
}
