import type { Coverage } from '../fonts/coverage';
import { parseFont } from '../fonts/loader';
import { normalizeName } from '../fonts/resolver';

import { BYTES, META, request } from './idb';
import { asBytes, bestFace, normalizeRecord } from './records';
import { requestPersistence, usageOf } from './storage';
import { FontLibraryError, type FontRecord, type LibraryUsage, type StorageManagerLike } from './types';

/** Read side of the library plus change notification (cross-tab through BroadcastChannel). */
export class LibraryStore {
  protected readonly listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;
  private closed = false;

  protected constructor(readonly name: string, protected readonly db: IDBDatabase, protected readonly storage: StorageManagerLike | null) {
    try {
      if (typeof BroadcastChannel === 'function') {
        this.channel = new BroadcastChannel(`par-fontlib:${name}`);
        this.channel.onmessage = () => this.emit(false);
      }
    } catch { this.channel = null; }
  }

  /** Every readable face, by family, weight and slope. Unreadable entries are skipped (see `repair()`). */
  async list(): Promise<FontRecord[]> {
    const raw = await request(this.tx([META], 'readonly').objectStore(META).getAll());
    return raw.flatMap((r) => normalizeRecord(r) ?? []).sort((a, b) => a.family.localeCompare(b.family) || a.weight - b.weight || Number(a.italic) - Number(b.italic));
  }

  async get(id: string): Promise<FontRecord | null> {
    return normalizeRecord(await request(this.tx([META], 'readonly').objectStore(META).get(id)));
  }

  /** Faces reachable by a name (family, full / PostScript name or alias; case-insensitive, `@` ignored). */
  async lookup(name: string): Promise<FontRecord[]> {
    const raw = await request(this.tx([META], 'readonly').objectStore(META).index('keys').getAll(normalizeName(name)));
    return raw.flatMap((r) => normalizeRecord(r) ?? []);
  }

  /** The best face for a request, or null. */
  async find(name: string, weight = 400, italic = false): Promise<FontRecord | null> {
    return bestFace(await this.lookup(name), weight, italic);
  }

  /** The font file's bytes (read only now), or null when missing or damaged. */
  async bytes(id: string): Promise<Uint8Array | null> {
    return asBytes(await request(this.tx([BYTES], 'readonly').objectStore(BYTES).get(id)));
  }

  /** Mapped code points of a stored face (reads and parses its bytes), or null. */
  async coverage(id: string): Promise<Coverage | null> {
    const data = await this.bytes(id);
    if (!data) return null;
    try { return (await parseFont({ name: id, data }))[0]?.info.coverage ?? null; } catch { return null; }
  }

  usage(): Promise<LibraryUsage> {
    return this.list().then((l) => usageOf(l.length, l.reduce((s, r) => s + r.size, 0), this.storage));
  }

  /** `navigator.storage.persist()`: ask the browser not to evict the library. Call from a user action. */
  requestPersistence(): Promise<boolean> {
    return requestPersistence(this.storage);
  }

  /** Calls `fn` whenever the library changes (also when another tab changed it). */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  close(): void {
    this.closed = true;
    this.channel?.close();
    this.listeners.clear();
    this.db.close();
  }

  protected tx(stores: string[], mode: IDBTransactionMode): IDBTransaction {
    if (this.closed) throw new FontLibraryError('closed', 'the font library was closed');
    return this.db.transaction(stores, mode);
  }

  protected emit(broadcast: boolean): void {
    if (broadcast) { try { this.channel?.postMessage(1); } catch { /* channel closed */ } }
    this.listeners.forEach((fn) => fn());
  }
}
