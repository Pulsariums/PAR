/** One media shelf: an ordered list with at most one selected item. Pure state, no DOM; each shelf is independent of the others. */
export class Shelf<T extends { id: string }> {
  private list: T[] = [];
  private sel: string | null = null;
  private readonly fns = new Set<() => void>();

  get items(): readonly T[] { return this.list; }
  get selectedId(): string | null { return this.sel; }
  get selected(): T | null { return this.list.find((i) => i.id === this.sel) ?? null; }

  /** Appends items. The first item of an empty shelf (or of a shelf without selection) becomes the selection. */
  add(items: readonly T[]): void {
    if (!items.length) return;
    this.list = [...this.list, ...items];
    if (this.sel === null) this.sel = items[0]!.id;
    this.emit();
  }

  /** Selects an item (unknown ids are ignored). Returns whether the selection changed. */
  select(id: string): boolean {
    if (id === this.sel || !this.list.some((i) => i.id === id)) return false;
    this.sel = id;
    this.emit();
    return true;
  }

  /** Removes an item. If it was selected, the next item (else the previous one, else nothing) takes over. Returns the removed item. */
  remove(id: string): T | null {
    const at = this.list.findIndex((i) => i.id === id);
    if (at < 0) return null;
    const [gone] = this.list.splice(at, 1);
    this.list = [...this.list];
    if (this.sel === id) this.sel = (this.list[at] ?? this.list[at - 1])?.id ?? null;
    this.emit();
    return gone!;
  }

  subscribe(fn: () => void): void { this.fns.add(fn); }
  private emit(): void { this.fns.forEach((f) => f()); }
}

let seq = 0;
export const newId = (prefix: string): string => `${prefix}${++seq}`;
