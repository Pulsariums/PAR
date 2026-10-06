import { readInputs } from '../fonts/input';
import { parseFont } from '../fonts/loader';
import type { FontProvider } from '../fonts/provider';
import type { FontInput } from '../fonts/types';

import { BYTES, META, committed, isQuotaError, openDb, request } from './idb';
import { LibraryStore } from './store';
import { exportLibrary } from './exportZip';
import { asProvider } from './provider';
import { asBytes, hashBytes, isCurrent, keysOf, normalizeRecord, recordOf } from './records';
import { defaultStorage, freeBytes } from './storage';
import type { AddResult, FontRecord, LibraryOptions, RepairResult } from './types';

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const nameOf = (x: FontInput): string => (typeof x === 'string' || x instanceof URL ? String(x) : (x as { name?: string }).name ?? '');

/**
 * The user's own, persistent font store (IndexedDB). Metadata and bytes live in separate stores, so `list()` is cheap
 * however many fonts there are; bytes are read only when a font is drawn, exported or previewed. Fonts are never
 * uploaded anywhere. Use `asProvider()` to let a renderer draw with them.
 */
export class FontLibrary extends LibraryStore {
  /** Opens (creating or upgrading) the library. Rejects with `FontLibraryError` (`unsupported`, `newer-schema`, `blocked`). */
  static async open(name = 'par-fonts', options: LibraryOptions = {}): Promise<FontLibrary> {
    const factory = options.factory ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    const lib = new FontLibrary(name, await openDb(factory, name), options.storage === undefined ? defaultStorage() : options.storage);
    await lib.upgradeRecords();
    return lib;
  }

  static delete(name: string, options: LibraryOptions = {}): Promise<void> {
    const factory = options.factory ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    return request(factory!.deleteDatabase(name)).then(() => undefined);
  }

  /** Adds font files, a `.zip` of fonts, URLs or bytes. Identical fonts (by content) are stored once. One bad input does not stop the rest. */
  async add(inputs: FontInput | readonly FontInput[], opts: { family?: string } = {}): Promise<AddResult> {
    const res: AddResult = { added: [], duplicates: [], errors: [] };
    const list = Array.isArray(inputs) ? inputs : [inputs as FontInput];
    const fresh: Array<{ rec: FontRecord; data: Uint8Array }> = [];
    const known = new Set((await this.list()).map((r) => r.id));
    for (const input of list) {
      try {
        for (const file of await readInputs(input)) {
          for (const p of await parseFont(file, opts.family)) {
            const id = await hashBytes(p.data);
            if (known.has(id)) { const r = await this.get(id); if (r) res.duplicates.push(r); continue; }
            known.add(id);
            fresh.push({ rec: recordOf(id, p, Date.now()), data: p.data });
          }
        }
      } catch (e) { res.errors.push({ name: nameOf(input), error: msg(e) }); }
    }
    if (!fresh.length) return res;
    const need = fresh.reduce((s, f) => s + f.data.byteLength, 0);
    const free = await freeBytes(this.storage);
    if (free !== null && need > free) {
      res.errors.push({ name: '', error: `not enough storage: ${need} bytes needed, about ${free} free` });
      return res;
    }
    try {
      const tx = this.tx([META, BYTES], 'readwrite');
      for (const f of fresh) {
        tx.objectStore(META).put(f.rec);
        tx.objectStore(BYTES).put({ id: f.rec.id, data: f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength) });
      }
      await committed(tx);
      res.added.push(...fresh.map((f) => f.rec));
      this.emit(true);
    } catch (e) {
      res.errors.push({ name: '', error: isQuotaError(e) ? 'storage quota exceeded' : msg(e) });
    }
    return res;
  }

  /** Removes faces; returns how many existed. */
  async remove(ids: string | readonly string[]): Promise<number> {
    const list = Array.isArray(ids) ? ids : [ids as string];
    const have = (await Promise.all(list.map((id) => this.get(id)))).filter(Boolean).length;
    const tx = this.tx([META, BYTES], 'readwrite');
    for (const id of list) { tx.objectStore(META).delete(id); tx.objectStore(BYTES).delete(id); }
    await committed(tx);
    if (have) this.emit(true);
    return have;
  }

  /** Replaces the names a script may use for this face besides the ones in the file. */
  async setAliases(id: string, aliases: readonly string[]): Promise<FontRecord | null> {
    const rec = await this.get(id);
    if (!rec) return null;
    const next = { ...rec, aliases: [...new Set(aliases.map((a) => a.trim().replace(/^@/, '').trim()).filter(Boolean))] };
    next.keys = keysOf(next);
    const tx = this.tx([META], 'readwrite');
    tx.objectStore(META).put(next);
    await committed(tx);
    this.emit(true);
    return next;
  }

  /** Renames one alias (adds `to` when `from` is not present). */
  async renameAlias(id: string, from: string, to: string): Promise<FontRecord | null> {
    const rec = await this.get(id);
    return rec ? this.setAliases(id, [...rec.aliases.filter((a) => a.toLowerCase() !== from.trim().toLowerCase()), to]) : null;
  }

  /** All fonts (or the given ids) as a .zip of the original font files plus a `manifest.json`. */
  exportZip(ids?: readonly string[]): Promise<Blob> {
    return exportLibrary(this, ids);
  }

  /** Removes unreadable metadata, metadata without usable bytes, and bytes nobody points at. */
  async repair(): Promise<RepairResult> {
    const metaStore = this.tx([META], 'readonly').objectStore(META);
    const [metaKeys, raw] = await Promise.all([request(metaStore.getAllKeys()), request(this.tx([META], 'readonly').objectStore(META).getAll())]);
    const byteRows = await request(this.tx([BYTES], 'readonly').objectStore(BYTES).getAll());
    const good = new Map(byteRows.flatMap((b) => (asBytes(b) ? [[String((b as { id: unknown }).id), true] as const] : [])));
    const keep = new Set<string>();
    const dropMeta: IDBValidKey[] = [];
    raw.forEach((r, i) => { const n = normalizeRecord(r); if (n && good.has(n.id)) keep.add(n.id); else dropMeta.push(metaKeys[i]); });
    const dropBytes = byteRows.map((b) => (b as { id?: unknown })?.id).filter((id): id is string => typeof id === 'string' && !keep.has(id));
    const tx = this.tx([META, BYTES], 'readwrite');
    dropMeta.forEach((k) => tx.objectStore(META).delete(k));
    dropBytes.forEach((k) => tx.objectStore(BYTES).delete(k));
    await committed(tx);
    if (dropMeta.length || dropBytes.length) this.emit(true);
    return { brokenRecords: dropMeta.length, orphanBytes: dropBytes.filter((id) => !dropMeta.includes(id)).length };
  }

  /** A `FontProvider` for `fontProviders`: serves the stored fonts by family / full name / alias and announces changes. */
  asProvider(options: { name?: string } = {}): FontProvider {
    return asProvider(this, options.name ?? `font library "${this.name}"`);
  }

  /** Rewrites entries stored with an older layout (missing keys / counters) so the `keys` index finds them. */
  private async upgradeRecords(): Promise<void> {
    const raw = await request(this.tx([META], 'readonly').objectStore(META).getAll());
    const stale = raw.filter((r) => !isCurrent(r));
    if (!stale.length) return;
    const tx = this.tx([META], 'readwrite');
    const store = tx.objectStore(META);
    for (const r of stale) { const n = normalizeRecord(r); if (n) store.put(n); }
    await committed(tx);
  }
}
