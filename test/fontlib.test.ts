import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { create } from '../src/index';
import { readZip } from '../src/fonts/zip';
import { buildTestFont, buildTestTtc } from '../src/fonts/testFont';
import { FontLibrary, type StorageManagerLike } from '../src/fontlib';

import { ass, dialogue, style } from './helpers/ass';
import { installCanvas } from './helpers/fakeCanvas';

const open: FontLibrary[] = [];
const lib = async (factory = new IDBFactory(), storage: StorageManagerLike | null = null, name = 'par-fonts') => {
  const l = await FontLibrary.open(name, { factory, storage });
  open.push(l);
  return l;
};
afterEach(() => { open.splice(0).forEach((l) => l.close()); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

const f = (family: string, extra: Parameters<typeof buildTestFont>[0] extends infer S ? Partial<S> : never = {}) => buildTestFont({ family, ...extra });
const readBlob = (b: Blob): Promise<Uint8Array> => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result as ArrayBuffer)); r.onerror = () => rej(r.error); r.readAsArrayBuffer(b); });
const file = (bytes: Uint8Array, name: string) => new File([bytes as BlobPart], name);

describe('FontLibrary: add, list, dedupe', () => {
  it('stores faces with names, weight, slope, size and script badges; lists metadata without reading bytes', async () => {
    const l = await lib();
    const r = await l.add([file(f('Alpha Sans'), 'a.ttf'), file(f('Alpha Sans', { weight: 700, italic: true, fullName: 'Alpha Sans Bold Italic' }), 'ab.ttf')]);
    expect(r.errors).toEqual([]);
    expect(r.added).toHaveLength(2);
    const list = await l.list();
    expect(list.map((x) => [x.family, x.weight, x.italic])).toEqual([['Alpha Sans', 400, false], ['Alpha Sans', 700, true]]);
    expect(list[0]).toMatchObject({ file: 'a.ttf', scripts: ['latin'], aliases: [] });
    expect(list[0].size).toBeGreaterThan(100);
    expect(list[0].glyphs).toBe(95);
    expect(list[0].keys).toContain('alpha sans');
    expect((await l.bytes(list[0].id))!.byteLength).toBe(list[0].size);
  });

  it('dedupes by content, across files, names and calls; a corrupt file only fails itself', async () => {
    const l = await lib();
    const bytes = f('Same');
    const r1 = await l.add([file(bytes, 'one.ttf'), file(bytes, 'copy.ttf'), file(new Uint8Array([9, 9, 9, 9, 9]), 'junk.ttf')]);
    expect(r1.added).toHaveLength(1);
    expect(r1.duplicates).toHaveLength(0); // the second copy in the same call is skipped before it is stored
    expect(r1.errors).toHaveLength(1);
    expect(r1.errors[0].name).toBe('junk.ttf');
    const r2 = await l.add(file(bytes, 'again.ttf'));
    expect(r2.added).toHaveLength(0);
    expect(r2.duplicates).toHaveLength(1);
    expect(await l.list()).toHaveLength(1);
  });

  it('expands a .zip and a TTC into separate faces', async () => {
    const l = await lib();
    const ttc = buildTestTtc([f('Coll One'), f('Coll Two')]);
    const r = await l.add(file(ttc, 'c.ttc'));
    expect(r.added.map((x) => x.family).sort()).toEqual(['Coll One', 'Coll Two']);
    const zip = await (await lib(new IDBFactory())).add(file(ttc, 'again.ttc'));
    expect(zip.added).toHaveLength(2);
  });

  it('indexes by family, full name, PostScript name and aliases (case-insensitive, @ ignored); aliases can be renamed', async () => {
    const l = await lib();
    const [rec] = (await l.add(file(f('Index Me', { fullName: 'Index Me Regular' }), 'i.ttf'))).added;
    expect((await l.lookup('@INDEX ME')).map((x) => x.id)).toEqual([rec.id]);
    expect((await l.lookup('index me regular')).map((x) => x.id)).toEqual([rec.id]);
    expect(await l.lookup('nobody')).toEqual([]);
    await l.setAliases(rec.id, ['@Friendly', ' Other ', 'friendly']);
    expect((await l.get(rec.id))!.aliases).toEqual(['Friendly', 'Other', 'friendly']);
    expect((await l.lookup('FRIENDLY'))).toHaveLength(1);
    await l.renameAlias(rec.id, 'other', 'Renamed');
    expect((await l.lookup('other'))).toEqual([]);
    expect((await l.lookup('renamed'))).toHaveLength(1);
    expect(await l.setAliases('missing-id', ['x'])).toBeNull();
  });

  it('find() picks the closest weight and the right slope', async () => {
    const l = await lib();
    await l.add([file(f('Fam', { weight: 400 }), 'r.ttf'), file(f('Fam', { weight: 700 }), 'b.ttf'), file(f('Fam', { weight: 400, italic: true }), 'i.ttf')]);
    expect((await l.find('Fam', 700, false))!.weight).toBe(700);
    expect((await l.find('Fam', 600, false))!.weight).toBe(700);
    expect((await l.find('Fam', 400, true))!.italic).toBe(true);
    expect((await l.find('Fam', 300, false))!.weight).toBe(400);
  });

  it('remove() deletes metadata and bytes; change listeners fire; export zips the originals with a manifest', async () => {
    const l = await lib();
    const changes = vi.fn();
    l.onChange(changes);
    const { added } = await l.add([file(f('Keep'), 'k.ttf'), file(f('Drop'), 'd.ttf')]);
    expect(changes).toHaveBeenCalledTimes(1);
    const blob = await l.exportZip();
    const entries = await readZip(await readBlob(blob), () => true);
    expect(entries.map((e) => e.name).sort()).toEqual([expect.stringMatching(/^Drop-400-\w{6}\.ttf$/), expect.stringMatching(/^Keep-400-\w{6}\.ttf$/), 'manifest.json']);
    const keepEntry = entries.find((e) => e.name.startsWith('Keep'))!;
    expect(keepEntry.data).toEqual(await l.bytes(added.find((a) => a.family === 'Keep')!.id));
    expect(JSON.parse(new TextDecoder().decode(entries.find((e) => e.name === 'manifest.json')!.data)).fonts).toHaveLength(2);
    expect(await l.remove([added[1].id, 'nope'])).toBe(1);
    expect(changes).toHaveBeenCalledTimes(2);
    expect((await l.list()).map((x) => x.family)).toEqual(['Keep']);
    expect(await l.bytes(added[1].id)).toBeNull();
  });

  it('persists across close and reopen of the same database', async () => {
    const factory = new IDBFactory();
    const a = await lib(factory);
    await a.add(file(f('Stays'), 's.ttf'));
    a.close();
    const b = await lib(factory);
    expect((await b.list()).map((x) => x.family)).toEqual(['Stays']);
  });
});

describe('FontLibrary as a provider', () => {
  it('a renderer draws with the library fonts, ranks them before system fonts, and picks up later uploads by itself', async () => {
    installCanvas(['Lib Font']);
    const l = await lib();
    await l.add(file(f('Lib Font'), 'l.ttf'));
    const box = document.createElement('div');
    Object.defineProperty(box, 'clientWidth', { value: 640 });
    Object.defineProperty(box, 'clientHeight', { value: 360 });
    document.body.appendChild(box);
    const par = create({ container: box, fontProviders: [l.asProvider()], subtitle: ass([style('A', 'Lib Font'), style('B', 'Later Font')], [dialogue('A', 'x'), dialogue('B', 'y')]) });
    await par.ready;
    const status = (n: string) => par.getFontReport().fonts.find((x) => x.name === n)!.status;
    expect(status('Lib Font')).toBe('provider');
    expect(status('Later Font')).toBe('missing');
    expect((await par.preflight()).providerHits).toEqual({ 'font library "par-fonts"': ['Lib Font'] });
    await l.add(file(f('Later Font'), 'later.ttf'));
    await vi.waitFor(() => expect(status('Later Font')).toBe('provider'));
    par.destroy();
  });
});
