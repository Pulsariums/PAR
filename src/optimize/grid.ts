import type { Spot } from './order';

const CELL = 256;
const key = (cx: number, cy: number): number => (cx + 4096) * 16384 + (cy + 4096);

interface Entry<T> { v: T; e: number }

/**
 * Items on screen over time, found by place: each is filed under the cells of the spots it draws at (and dropped lazily once its end time has
 * passed), so asking "what is near here" visits the neighbouring cells instead of everything. Items with an unknown place are kept apart and
 * are returned for every query.
 */
export class Grid<T> {
  private readonly cells = new Map<number, Array<Entry<T>>>();
  private loose: Array<Entry<T>> = [];
  private stamp = 0;
  private readonly seen = new Map<Entry<T>, number>();

  /** `spots` = every place the item draws at; undefined or any missing = unknown. */
  add(v: T, e: number, spots: ReadonlyArray<Spot | undefined>): void {
    const entry = { v, e };
    if (spots.length === 0 || spots.some((s) => !s)) { this.loose.push(entry); return; }
    const cs = new Set<number>();
    for (const s of spots as Spot[]) cs.add(key(Math.floor(s.x / CELL), Math.floor(s.y / CELL)));
    for (const c of cs) (this.cells.get(c) ?? this.cells.set(c, []).get(c)!).push(entry);
  }

  /** Visits every live item (end after `now`) that may be within `reach` of any of `spots` once; `spots` unknown = every item. */
  near(spots: ReadonlyArray<Spot | undefined>, reach: number, now: number, visit: (v: T) => void): void {
    const id = ++this.stamp;
    const go = (en: Entry<T>): void => {
      if (this.seen.get(en) === id) return;
      this.seen.set(en, id);
      visit(en.v);
    };
    this.loose = this.loose.filter((en) => en.e > now);
    for (const en of this.loose) go(en);
    const all = spots.length === 0 || spots.some((s) => !s);
    if (all) {
      for (const [k, list] of this.cells) {
        const live = list.filter((en) => en.e > now);
        if (live.length) this.cells.set(k, live); else this.cells.delete(k);
        for (const en of live) go(en);
      }
    } else {
      for (const s of spots as Spot[]) {
        const rr = Math.ceil((s.r + reach) / CELL);
        const cx = Math.floor(s.x / CELL), cy = Math.floor(s.y / CELL);
        for (let x = cx - rr; x <= cx + rr; x++) {
          for (let y = cy - rr; y <= cy + rr; y++) {
            const k = key(x, y);
            const list = this.cells.get(k);
            if (!list) continue;
            const live = list.length && list.some((en) => en.e <= now) ? list.filter((en) => en.e > now) : list;
            if (live !== list) { if (live.length) this.cells.set(k, live); else this.cells.delete(k); }
            for (const en of live) go(en);
          }
        }
      }
    }
    if (this.seen.size > 50000) this.seen.clear();
  }
}

const BUCKET = 1000;

/**
 * Items fixed in place and time (candidates for merging), found by both: one cell per (screen cell, second). Unlike `Grid` nothing expires,
 * so a lookup for a few frames in one corner does not walk everything that ever happened there.
 */
export class TimedGrid<T> {
  private readonly cells = new Map<string, T[]>();
  private loose: T[] = [];
  private stamp = 0;
  private readonly seen = new Map<T, number>();

  add(v: T, s: number, e: number, spots: ReadonlyArray<Spot | undefined>): void {
    if (spots.length === 0 || spots.some((x) => !x)) { this.loose.push(v); return; }
    const ks = new Set<string>();
    for (const sp of spots as Spot[]) for (let b = Math.floor(s / BUCKET); b <= Math.floor(e / BUCKET); b++) ks.add(`${Math.floor(sp.x / CELL)},${Math.floor(sp.y / CELL)},${b}`);
    for (const k of ks) (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(v);
  }

  /** Visits every item that may be within `reach` of `spot` at some moment of [s, e) once (unknown places are always visited). */
  near(spot: Spot | undefined, reach: number, s: number, e: number, visit: (v: T) => void): void {
    const id = ++this.stamp;
    const go = (v: T): void => { if (this.seen.get(v) !== id) { this.seen.set(v, id); visit(v); } };
    for (const v of this.loose) go(v);
    if (!spot) { for (const list of this.cells.values()) for (const v of list) go(v); return; }
    const rr = Math.ceil((spot.r + reach) / CELL);
    const cx = Math.floor(spot.x / CELL), cy = Math.floor(spot.y / CELL);
    for (let b = Math.floor(s / BUCKET); b <= Math.floor(Math.max(s, e - 1) / BUCKET); b++) {
      for (let x = cx - rr; x <= cx + rr; x++) for (let y = cy - rr; y <= cy + rr; y++) for (const v of this.cells.get(`${x},${y},${b}`) ?? []) go(v);
    }
    if (this.seen.size > 50000) this.seen.clear();
  }
}
