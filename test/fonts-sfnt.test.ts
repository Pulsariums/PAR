import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { parseFont } from '../src/fonts/loader';
import { readFaces } from '../src/fonts/sfnt';
import { readFaceInfo } from '../src/fonts/sfntInfo';
import { buildTestFont, buildTestTtc } from '../src/fonts/testFont';

import { concat } from './helpers/bytes';

const info = async (data: Uint8Array) => readFaceInfo((await readFaces(data))[0]);

describe('name table / face info', () => {
  it('reads family, full name, weight, slope and metrics from a TTF', async () => {
    const i = await info(buildTestFont({ family: 'Test Sans', subfamily: 'Bold Italic', weight: 700, italic: true, unitsPerEm: 2048, win: [1900, 500], hhea: [1800, 400], typo: [1700, 300] }));
    expect(i.family).toBe('Test Sans');
    expect(i.fullNames).toContain('Test Sans Bold Italic');
    expect(i.fullNames).toContain('TestSans-BoldItalic');
    expect(i).toMatchObject({ weight: 700, italic: true, boldFlag: true });
    expect(i.metrics).toMatchObject({ unitsPerEm: 2048, winAscent: 1900, winDescent: 500, hheaAscent: 1800, hheaDescent: -400, typoAscent: 1700, typoDescent: -300 });
  });

  it('prefers the typographic family (nameID 16) and keeps the legacy one as an alias', async () => {
    const i = await info(buildTestFont({ family: 'Open Test Semibold', typoFamily: 'Open Test', subfamily: 'Regular', weight: 600 }));
    expect(i.family).toBe('Open Test');
    expect(i.families).toEqual(['Open Test', 'Open Test Semibold']);
    expect(i.weight).toBe(600);
  });

  it('reads Macintosh (platform 1) records too, and does not duplicate names', async () => {
    const i = await info(buildTestFont({ family: 'Mac Test', mac: true }));
    expect(i.families).toEqual(['Mac Test']);
  });

  it('decodes non-Latin UTF-16BE names (including surrogate pairs)', async () => {
    const i = await info(buildTestFont({ family: 'ゴシック 𝒜', subfamily: 'Regular' }));
    expect(i.family).toBe('ゴシック 𝒜');
  });

  it('maps legacy OS/2 weight codes like libass (1..9, 0)', async () => {
    const { faceWeight } = await import('../src/fonts/sfntInfo');
    expect([0, 1, 5, 6, 7, 9, 450, 1000].map((w) => faceWeight(w, false))).toEqual([400, 100, 400, 600, 700, 900, 450, 1000]);
    expect(faceWeight(0, true)).toBe(700);
  });
});

describe('containers', () => {
  it('reads every member of a TTC and extracts each as a standalone font', async () => {
    const a = buildTestFont({ family: 'Coll A' });
    const b = buildTestFont({ family: 'Coll B', weight: 700, subfamily: 'Bold' });
    const faces = await parseFont({ name: 'c.ttc', data: buildTestTtc([a, b]) });
    expect(faces.map((f) => f.info.family)).toEqual(['Coll A', 'Coll B']);
    expect(faces[1].info.weight).toBe(700);
    expect(new Set(faces.map((f) => f.key)).size).toBe(2);
    // The standalone copy is a valid sfnt of its own.
    const again = await readFaces(faces[1].data);
    expect(readFaceInfo(again[0]).family).toBe('Coll B');
    expect(faces[1].data[0]).toBe(0);
  });

  const woff1 = (sfnt: Uint8Array, compress: boolean): Uint8Array => {
    const v = new DataView(sfnt.buffer, sfnt.byteOffset);
    const n = v.getUint16(4);
    const entries = Array.from({ length: n }, (_, i) => {
      const r = 12 + i * 16;
      const raw = sfnt.subarray(v.getUint32(r + 8), v.getUint32(r + 8) + v.getUint32(r + 12));
      const comp = compress ? deflateSync(raw) : raw;
      return { tag: sfnt.subarray(r, r + 4), orig: raw.length, data: comp.length < raw.length ? comp : raw, sum: v.getUint32(r + 4) };
    });
    let off = 44 + n * 20;
    const out = new Uint8Array(off + entries.reduce((s, e) => s + ((e.data.length + 3) & ~3), 0));
    const w = new DataView(out.buffer);
    out.set([0x77, 0x4f, 0x46, 0x46]);
    w.setUint32(4, 0x00010000);
    w.setUint16(12, n);
    entries.forEach((e, i) => {
      const r = 44 + i * 20;
      out.set(e.tag, r);
      w.setUint32(r + 4, off); w.setUint32(r + 8, e.data.length); w.setUint32(r + 12, e.orig); w.setUint32(r + 16, e.sum);
      out.set(e.data, off);
      off += (e.data.length + 3) & ~3;
    });
    return out;
  };

  it('reads WOFF (zlib-compressed and stored tables)', async () => {
    const ttf = buildTestFont({ family: 'Woff One', weight: 300, subfamily: 'Light' });
    for (const compress of [true, false]) {
      const i = await info(woff1(ttf, compress));
      expect(i).toMatchObject({ family: 'Woff One', weight: 300 });
      expect(i.metrics?.winAscent).toBe(800);
    }
  });

  it('reads WOFF2 via an injected Brotli inflater (table directory + concatenated stream)', async () => {
    const { brotliCompressSync, brotliDecompressSync } = await import('node:zlib');
    const ttf = buildTestFont({ family: 'Woff Two' });
    const v = new DataView(ttf.buffer);
    const picks = ['OS/2', 'head', 'hhea', 'name'];
    const dir: number[] = [];
    const data: Uint8Array[] = [];
    for (let i = 0; i < v.getUint16(4); i++) {
      const r = 12 + i * 16;
      const tag = String.fromCharCode(...ttf.subarray(r, r + 4));
      if (!picks.includes(tag)) continue;
      const len = v.getUint32(r + 12);
      data.push(ttf.subarray(v.getUint32(r + 8), v.getUint32(r + 8) + len));
      // flag 63 = explicit tag; version 0 (null transform); length as UIntBase128 (< 16384 => 1-2 bytes)
      dir.push(63, ...tag.split('').map((c) => c.charCodeAt(0)), ...(len < 128 ? [len] : [0x80 | (len >> 7), len & 127]));
    }
    const comp = brotliCompressSync(concat(data));
    const out = new Uint8Array(48 + dir.length + comp.length);
    const w = new DataView(out.buffer);
    out.set([0x77, 0x4f, 0x46, 0x32]);
    w.setUint32(4, 0x00010000);
    w.setUint16(12, picks.length);
    w.setUint32(20, comp.length);
    out.set(dir, 48);
    out.set(comp, 48 + dir.length);
    const faces = await parseFont({ name: 'x.woff2', data: out }, undefined, async (d) => new Uint8Array(brotliDecompressSync(d)));
    expect(faces[0].info.family).toBe('Woff Two');
    expect(faces[0].info.metrics?.unitsPerEm).toBe(1000);
  });

  it('WOFF2 without Brotli degrades to the file name instead of failing', async () => {
    const out = new Uint8Array(60);
    out.set([0x77, 0x4f, 0x46, 0x32]);
    const faces = await parseFont({ name: 'Some Font_0.woff2', data: out }, undefined, async () => { throw new Error('no brotli'); });
    expect(faces[0].info.family).toBe('Some Font');
    expect(faces[0].degraded).toMatch(/no brotli/);
  });

  it('rejects non-fonts and honours an explicit family override', async () => {
    await expect(parseFont({ name: 'a.txt', data: new TextEncoder().encode('hello world') })).rejects.toThrow(/not a TTF/);
    const [f] = await parseFont({ name: 'x.ttf', data: buildTestFont({ family: 'Real' }) }, 'Forced');
    expect(f.info.family).toBe('Forced');
    expect(f.info.families).toContain('Real');
  });

  it('survives truncated files without throwing', async () => {
    const ttf = buildTestFont({ family: 'Cut' });
    for (const n of [4, 12, 40, 200, ttf.length - 5]) {
      await expect(readFaces(ttf.subarray(0, n))).resolves.toBeDefined();
    }
  });
});
