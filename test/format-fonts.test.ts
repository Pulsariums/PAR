// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { extractEmbeddedFiles } from '../src/fonts/uudecode';
import { bakePar, encodeXpar, openPar, openXpar } from '../src/format';
import { fromPar, fromXpar } from '../src/source';

import { SAMPLE } from './fixtures';

const te = new TextEncoder();
/** Something font-like: tables of repeating structure (compressible). */
const tableFont = (n: number, seed = 1): Uint8Array => {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i % 97) * seed + ((i >> 5) & 7);
  return b;
};
/** Incompressible bytes (a WOFF2 or a CJK font is close to this). */
const noise = (n: number, seed = 7): Uint8Array => {
  const b = new Uint8Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; b[i] = s >>> 24; }
  return b;
};

const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

describe('fonts attached to XPAR / PAR files (lossless)', () => {
  it('gives every font back byte for byte, deflated only when it saves space', async () => {
    const a = tableFont(200_000), b = noise(50_000), c = te.encode('tiny');
    const x = await encodeXpar(te.encode(SAMPLE), { fonts: [{ name: 'Hand Made.ttf', data: a }, { name: 'packed.woff2', data: b }, { name: 'tiny.bin', data: c }] });
    const f = await openXpar(x);
    expect(f.fonts.map((z) => z.name)).toEqual(['Hand Made.ttf', 'packed.woff2', 'tiny.bin']);
    const back = await Promise.all(f.fonts.map((z) => z.read()));
    expect(same(back[0], a) && same(back[1], b) && same(back[2], c)).toBe(true);
    expect(f.fonts[0].size).toBe(200_000);
    expect(f.fonts[0].stored).toBeLessThan(100_000);
    expect(f.fonts[1].stored).toBe(50_000); // incompressible: kept as it is
    expect(f.meta.fonts.map((z) => z.codec)).toEqual([1, 0, 0]);
    // the subtitle itself is untouched
    expect(same(await f.toAss(), te.encode(SAMPLE))).toBe(true);
  });

  it('a tiny script with fonts is still a container (the stored form has no room for attachments)', async () => {
    const x = await encodeXpar(te.encode('[Script Info]\nTitle: x\n'), { fonts: [{ name: 'a.ttf', data: tableFont(5000) }] });
    expect((await openXpar(x)).fonts).toHaveLength(1);
  });

  it('adding the same file twice stores it once', async () => {
    const d = tableFont(30_000);
    const x = await encodeXpar(te.encode(SAMPLE), { fonts: [{ name: 'a.ttf', data: d }, { name: 'a.ttf', data: d.slice() }, { name: 'b.ttf', data: d }] });
    expect((await openXpar(x)).fonts.map((z) => z.name)).toEqual(['a.ttf', 'b.ttf']);
  });

  it('a damaged font is reported, not returned', async () => {
    const x = await encodeXpar(te.encode(SAMPLE), { fonts: [{ name: 'a.ttf', data: noise(4000) }] });
    const f = await openXpar(x);
    const at = f.meta.fonts[0].offset + 100;
    const bad = x.slice();
    bad[at] ^= 0xff;
    await expect((await openXpar(bad)).fonts[0].read()).rejects.toMatchObject({ code: 'CHECKSUM' });
  });

  it('PAR (lossy) carries fonts too, and a file without fonts has none', async () => {
    const d = tableFont(80_000, 3);
    const { bytes } = await bakePar(te.encode(SAMPLE), { fps: 24 }, { fonts: [{ name: 'x.otf', data: d }] });
    const { file } = await openPar(bytes);
    expect(file.fonts).toHaveLength(1);
    expect(same(await file.fonts[0].read(), d)).toBe(true);
    expect((await openXpar(await encodeXpar(te.encode(SAMPLE)))).fonts).toHaveLength(0);
  });

  it('the player gets them: the source offers them as an ASS [Fonts] section the renderer decodes to the same bytes', async () => {
    const d = tableFont(70_001, 5);
    const x = await encodeXpar(te.encode(SAMPLE), { fonts: [{ name: 'Mine.ttf', data: d }] });
    const text = await (await fromXpar(x)).fontSection!();
    expect(text).toMatch(/^\[Fonts\]/);
    const [one] = extractEmbeddedFiles(text!);
    expect(one.name).toBe('Mine.ttf');
    expect(same(one.data, d)).toBe(true);
    const par = await bakePar(te.encode(SAMPLE), { fps: 24 }, { fonts: [{ name: 'Mine.ttf', data: d }] });
    expect(same(extractEmbeddedFiles((await (await fromPar(par.bytes)).fontSection!())!)[0].data, d)).toBe(true);
  });

  it('keeps the script\'s own [Fonts] section and adds the attached ones to it', async () => {
    const own = `${SAMPLE}\n[Fonts]\nfontname: Own_0.ttf\n${'!!!!'}\n`;
    const d = tableFont(1000);
    const x = await encodeXpar(te.encode(own), { fonts: [{ name: 'Added.ttf', data: d }] });
    const text = (await (await fromXpar(x)).fontSection!())!;
    expect(text.match(/\[Fonts\]/g)).toHaveLength(1);
    expect(text).toContain('Own_0.ttf');
    expect(extractEmbeddedFiles(text).map((f) => f.name)).toEqual(['Own_0.ttf', 'Added.ttf']);
    expect(same(await (await openXpar(x)).toAss(), te.encode(own))).toBe(true);
  });
});
