import { zipStore } from '../src/fontlib';
import { FontBox } from '../site/src/convert/fonts';
import { describe, expect, it } from 'vitest';

const f = (name: string, n: number): File => new File([new Uint8Array(n).fill(7)], name);

describe('FontBox', () => {
  it('takes fonts, dedupes by name and size, rejects the rest', async () => {
    const b = new FontBox();
    await b.add([f('A.ttf', 10), f('A.ttf', 10), f('A.ttf', 11), f('notes.txt', 3)]);
    expect(b.list.map((x) => x.size)).toEqual([10, 11]);
    expect(b.rejected).toEqual(['notes.txt']);
    expect(b.bytes).toBe(21);
  });
  it('opens a zip and keeps each font under its own file name', async () => {
    const z = await zipStore([{ name: 'Fonts/Sub/B.otf', data: new Uint8Array(5).fill(1) }, { name: 'readme.txt', data: new Uint8Array(2) }]);
    const b = new FontBox();
    await b.add([new File([z as BlobPart], 'pack.zip')]);
    expect(b.list.map((x) => x.name)).toEqual(['B.otf']);
    expect(new Uint8Array(await b.list[0].arrayBuffer())).toEqual(new Uint8Array(5).fill(1));
  });
  it('remove and clear', async () => {
    const b = new FontBox();
    await b.add([f('A.ttf', 1), f('B.ttf', 1)]);
    b.remove(0);
    expect(b.list.map((x) => x.name)).toEqual(['B.ttf']);
    b.clear();
    expect(b.list.length).toBe(0);
  });
});
