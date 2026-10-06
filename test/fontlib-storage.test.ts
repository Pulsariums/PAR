import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildTestFont } from '../src/fonts/testFont';
import { FontLibrary, FontLibraryError, SCHEMA_VERSION, type StorageManagerLike } from '../src/fontlib';


const open: FontLibrary[] = [];
const lib = async (factory = new IDBFactory(), storage: StorageManagerLike | null = null, name = 'par-fonts') => {
  const l = await FontLibrary.open(name, { factory, storage });
  open.push(l);
  return l;
};
afterEach(() => { open.splice(0).forEach((l) => l.close()); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

const f = (family: string, extra: Parameters<typeof buildTestFont>[0] extends infer S ? Partial<S> : never = {}) => buildTestFont({ family, ...extra });
const file = (bytes: Uint8Array, name: string) => new File([bytes as BlobPart], name);

describe('FontLibrary: storage, schema, corruption', () => {
  it('usage() reports bytes and the quota ratio; warns from 80 %; persistence helper', async () => {
    const st: StorageManagerLike = { estimate: async () => ({ usage: 850_000_000, quota: 1_000_000_000 }), persist: async () => true, persisted: async () => false };
    const l = await lib(new IDBFactory(), st);
    await l.add(file(f('Sized'), 's.ttf'));
    const u = await l.usage();
    expect(u).toMatchObject({ count: 1, used: 850_000_000, quota: 1_000_000_000, ratio: 0.85, warn: true, persisted: false });
    expect(u.bytes).toBeGreaterThan(0);
    expect(await l.requestPersistence()).toBe(true);
    const none = await lib(new IDBFactory(), null);
    expect(await none.usage()).toMatchObject({ used: null, quota: null, ratio: null, warn: false, persisted: null });
    expect(await none.requestPersistence()).toBe(false);
  });

  it('refuses an upload that cannot fit the free space, without storing anything', async () => {
    const l = await lib(new IDBFactory(), { estimate: async () => ({ usage: 99_990, quota: 100_000 }) });
    const r = await l.add(file(f('Too Big'), 'big.ttf'));
    expect(r.added).toEqual([]);
    expect(r.errors[0].error).toMatch(/not enough storage/);
    expect(await l.list()).toEqual([]);
  });

  it('opens a database written with an older record layout and upgrades the entries', async () => {
    const factory = new IDBFactory();
    const first = await lib(factory);
    await first.add(file(f('Legacy'), 'l.ttf'));
    const [rec] = await first.list();
    first.close();
    // simulate an entry written by an earlier layout: no v, no keys, no aliases, no scripts
    const db = await new Promise<IDBDatabase>((res, rej) => { const q = factory.open('par-fonts'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ id: rec.id, family: 'Legacy', file: 'l.ttf', weight: 400 });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
    const again = await lib(factory);
    expect((await again.lookup('legacy')).map((x) => x.id)).toEqual([rec.id]);
    expect((await again.get(rec.id))).toMatchObject({ v: 1, aliases: [], scripts: [], italic: false });
    expect(await again.bytes(rec.id)).not.toBeNull();
  });

  it('refuses a database from a newer schema; reports missing IndexedDB', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((res) => { const q = factory.open('future', SCHEMA_VERSION + 5); q.onupgradeneeded = () => q.result.createObjectStore('x'); q.onsuccess = () => { q.result.close(); res(); }; });
    await expect(FontLibrary.open('future', { factory })).rejects.toMatchObject({ code: 'newer-schema' });
    vi.stubGlobal('indexedDB', undefined);
    await expect(FontLibrary.open('x')).rejects.toBeInstanceOf(FontLibraryError);
  });

  it('survives corrupt entries: bad metadata is skipped, damaged bytes read as null, repair() cleans up', async () => {
    const factory = new IDBFactory();
    const l = await lib(factory);
    const { added } = await l.add([file(f('Good'), 'g.ttf'), file(f('NoBytes'), 'n.ttf'), file(f('BadBytes'), 'b.ttf')]);
    const raw = await new Promise<IDBDatabase>((res) => { const q = factory.open('par-fonts'); q.onsuccess = () => res(q.result); });
    await new Promise<void>((res) => {
      const tx = raw.transaction(['meta', 'bytes'], 'readwrite');
      tx.objectStore('meta').put({ id: 'junk1', family: 42 });
      tx.objectStore('meta').put({ id: 'junk2' });
      tx.objectStore('bytes').delete(added.find((a) => a.family === 'NoBytes')!.id);
      tx.objectStore('bytes').put({ id: added.find((a) => a.family === 'BadBytes')!.id, data: 'garbage' });
      tx.objectStore('bytes').put({ id: 'orphan', data: new ArrayBuffer(4) });
      tx.oncomplete = () => res();
    });
    raw.close();
    expect((await l.list()).map((x) => x.family).sort()).toEqual(['BadBytes', 'Good', 'NoBytes']);
    expect(await l.bytes(added.find((a) => a.family === 'BadBytes')!.id)).toBeNull();
    const provider = l.asProvider();
    expect(await provider.get('BadBytes', { weight: 400, italic: false })).toBeNull();
    expect(await provider.get('NoBytes', { weight: 400, italic: false })).toBeNull();
    const rep = await l.repair();
    expect(rep.brokenRecords).toBe(4); // two junk entries, NoBytes, BadBytes
    expect(rep.orphanBytes).toBe(1); // 'orphan' (the damaged BadBytes row goes with its broken record)
    expect((await l.list()).map((x) => x.family)).toEqual(['Good']);
  });

  it('cannot be used after close()', async () => {
    const l = await lib();
    l.close();
    await expect(l.list()).rejects.toMatchObject({ code: 'closed' });
  });
});

