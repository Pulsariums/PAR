import { describe, expect, it } from 'vitest';

import { countAll, countIn, hasCp, nthCp, readCmap } from '../src/fonts/coverage';
import { parseFont } from '../src/fonts/loader';
import { buildTestFont, buildTestTtc, customCmap } from '../src/fonts/testFont';
import { MAX_GLYPH_SAMPLE, preflightScript } from '../src/index';
import { SCRIPTS, blockName, codeLabel, scriptBadges, scriptRatios } from '../src/fontlib';

import { ass, dialogue, style } from './helpers/ass';
import { scanScript } from '../src/preflight/preflight';

const cps = (c: Uint32Array): number[] => {
  const out: number[] = [];
  for (let i = 0; i < c.length; i += 2) for (let x = c[i]; x <= c[i + 1]; x++) out.push(x);
  return out;
};
const be16 = (n: number): number[] => [(n >> 8) & 255, n & 255];
const be32 = (n: number): number[] => [...be16(n >>> 16), ...be16(n & 0xffff)];

describe('cmap reader', () => {
  it('reads format 4 (idDelta segments) and format 12 groups into merged ranges', () => {
    const ranges: Array<[number, number]> = [[0x20, 0x7e], [0x400, 0x45f], [0x3041, 0x3093]];
    for (const format of [4, 12] as const) {
      const cov = readCmap(Uint8Array.from(customCmap(format, ranges)));
      expect(Array.from(cov), `format ${format}`).toEqual([0x20, 0x7e, 0x400, 0x45f, 0x3041, 0x3093]);
    }
    const astral = readCmap(Uint8Array.from(customCmap(12, [[0x41, 0x5a], [0x1f600, 0x1f64f]])));
    expect(Array.from(astral)).toEqual([0x41, 0x5a, 0x1f600, 0x1f64f]);
  });

  it('format 4 with idRangeOffset: glyph 0 inside the glyph array means "not mapped"', () => {
    // 2 segments: [0x41..0x43] via glyphIdArray [5, 0, 7], and the 0xFFFF terminator
    const sub = [...be16(4), ...be16(16 + 16 + 6), ...be16(0), ...be16(4), ...be16(4), ...be16(1), ...be16(0),
      ...be16(0x43), ...be16(0xffff), ...be16(0), ...be16(0x41), ...be16(0xffff), ...be16(0), ...be16(1), ...be16(4), ...be16(0), ...be16(5), ...be16(0), ...be16(7)];
    const table = Uint8Array.from([...be16(0), ...be16(1), ...be16(3), ...be16(1), ...be32(12), ...sub]);
    expect(cps(readCmap(table))).toEqual([0x41, 0x43]);
  });

  it('a hole where idDelta maps a character to glyph 0 is excluded', () => {
    // one segment [0x41..0x45] with idDelta = 0x10000 - 0x43, so 0x43 maps to glyph 0
    const sub = [...be16(4), ...be16(16 + 16), ...be16(0), ...be16(4), ...be16(4), ...be16(1), ...be16(0),
      ...be16(0x45), ...be16(0xffff), ...be16(0), ...be16(0x41), ...be16(0xffff), ...be16(0x10000 - 0x43), ...be16(1), ...be16(0), ...be16(0)];
    expect(cps(readCmap(Uint8Array.from([...be16(0), ...be16(1), ...be16(3), ...be16(1), ...be32(12), ...sub])))).toEqual([0x41, 0x42, 0x44, 0x45]);
  });

  it('survives truncated, empty and hostile tables', () => {
    expect(readCmap(new Uint8Array(0))).toHaveLength(0);
    expect(readCmap(Uint8Array.from([0, 0, 0, 1, 0, 3, 0, 1, 0xff, 0xff, 0xff, 0xff]))).toHaveLength(0);
    const good = Uint8Array.from(customCmap(4, [[0x41, 0x5a]]));
    expect(() => readCmap(good.subarray(0, 30))).not.toThrow();
  });

  it('hasCp / countIn / countAll / nthCp', () => {
    const c = Uint32Array.from([0x41, 0x43, 0x100, 0x101]);
    expect([0x40, 0x41, 0x43, 0x44, 0xff, 0x100, 0x101, 0x102].map((x) => hasCp(c, x))).toEqual([false, true, true, false, false, true, true, false]);
    expect(countAll(c)).toBe(5);
    expect(countIn(c, 0x42, 0x100)).toBe(3);
    expect([0, 2, 3, 4, 5].map((n) => nthCp(c, n))).toEqual([0x41, 0x43, 0x100, 0x101, -1]);
  });
});

describe('coverage through parseFont', () => {
  it('is read from the default test font, custom fonts and every TTC member', async () => {
    const plain = (await parseFont({ name: 'a.ttf', data: buildTestFont({ family: 'Plain' }) }))[0];
    expect(Array.from(plain.info.coverage!)).toEqual([0x20, 0x7e]);
    const cyr = buildTestFont({ family: 'Cyr', cmap: { format: 12, ranges: [[0x20, 0x7e], [0x400, 0x4ff]] } });
    expect(Array.from((await parseFont({ name: 'c.ttf', data: cyr }))[0].info.coverage!)).toEqual([0x20, 0x7e, 0x400, 0x4ff]);
    const ttc = await parseFont({ name: 'c.ttc', data: buildTestTtc([buildTestFont({ family: 'One' }), cyr]) });
    expect(ttc.map((f) => countAll(f.info.coverage!))).toEqual([95, 95 + 256]);
  });
});

describe('script badges', () => {
  const font = (ranges: Array<[number, number]>) => Uint32Array.from(ranges.flat());
  it('a badge means every sample character is present', () => {
    expect(scriptBadges(null)).toEqual([]);
    expect(scriptBadges(font([[0x20, 0x7e]]))).toEqual(['latin']);
    const rich = font([[0x20, 0x7e], [0xa0, 0x17f], [0x18f, 0x18f], [0x218, 0x21b], [0x259, 0x259], [0x370, 0x3ff], [0x400, 0x45f], [0x2013, 0x2014], [0x2018, 0x201d], [0x2022, 0x2022], [0x2026, 0x2026], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x2190, 0x2193], [0x2605, 0x2606], [0x2665, 0x2665], [0x266a, 0x266b], [0x3041, 0x3093], [0x30a1, 0x30f3]]);
    expect(scriptBadges(rich)).toEqual(['latin', 'latin-ext', 'cyrillic', 'greek', 'hiragana', 'katakana', 'symbols']);
    expect(scriptRatios(rich).kanji).toBe(0);
  });

  it('one missing character removes the badge but the ratio shows how close it is', () => {
    const almost = font([[0x20, 0x7e], [0xa0, 0x17f], [0x18f, 0x18f]]); // lacks ğ? (0x11f is inside 0xa0..0x17f) but lacks ș ț ă? ă is 0x103 inside; ș 0x219 outside
    expect(scriptBadges(almost)).not.toContain('latin-ext');
    expect(scriptRatios(almost)['latin-ext']).toBeGreaterThan(0.8);
    expect(SCRIPTS.map((s) => s.id)).toEqual(['latin', 'latin-ext', 'cyrillic', 'greek', 'hiragana', 'katakana', 'kanji', 'symbols']);
  });

  it('block names and code labels', () => {
    expect(blockName(0x41)).toBe('Basic Latin');
    expect(blockName(0x431)).toBe('Cyrillic');
    expect(blockName(0x3042)).toBe('Hiragana');
    expect(blockName(0x1f600)).toBe('Emoticons');
    expect(blockName(0x2fa1d)).toBe('');
    expect(codeLabel(0x41)).toBe('U+0041');
    expect(codeLabel(0x1f600)).toBe('U+1F600');
  });
});

describe('characters a script really draws', () => {
  const chars = async (text: string): Promise<string> => {
    const sc = await scanScript(ass([style('Default', 'F')], [dialogue('Default', text)]), {});
    return String.fromCodePoint(...[...sc.uses.get('f')!.chars].sort((a, b) => a - b));
  };

  it('leaves out override blocks, \\N \\n \\h, spaces and drawing commands; keeps astral characters whole', async () => {
    expect(await chars('{\\b1}Ab\\Nc\\hd{\\i1}e f\\ng😀')).toBe('Abcdefg😀'.split('').sort().join('').replace('😀', '') + '😀');
    expect(await chars('{\\p1}m 0 0 l 5 5{\\p0}Z')).toBe('Z');
    expect(await chars('{not a tag}hi')).toBe('hi');
  });

  it('missingGlyphs: exact count, ascending, capped sample, per family; a family without a cmap is not judged', async () => {
    const latin = buildTestFont({ family: 'Latin' });
    const many = Array.from({ length: 200 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join('');
    const r = await preflightScript(ass([style('A', 'Latin'), style('B', 'Elsewhere')], [dialogue('A', `abc${many}`), dialogue('B', many)]), { fonts: [latin] });
    expect(r.missingGlyphs.Latin.count).toBe(200);
    expect(r.missingGlyphs.Latin.sample).toHaveLength(MAX_GLYPH_SAMPLE);
    expect(r.missingGlyphs.Latin.sample).toEqual([...r.missingGlyphs.Latin.sample].sort((a, b) => a - b));
    expect(r.missingGlyphs.Elsewhere).toBeUndefined();
    expect(r.missing.length + r.resolved.length).toBe(2);
  });

  it('uses the face the request resolves to: a bold face with more glyphs fixes the report for bold text only', async () => {
    const reg = buildTestFont({ family: 'Duo', weight: 400 });
    const bold = buildTestFont({ family: 'Duo', weight: 700, cmap: { format: 4, ranges: [[0x20, 0x7e], [0x400, 0x45f]] } });
    const r = await preflightScript(ass([style('Default', 'Duo')], [dialogue('Default', '{\\b1}Привет')]), { fonts: [reg, bold] });
    expect(r.missingGlyphs.Duo).toBeUndefined();
    const r2 = await preflightScript(ass([style('Default', 'Duo')], [dialogue('Default', '{\\b0}Привет')]), { fonts: [reg, bold] });
    expect(r2.missingGlyphs.Duo.count).toBe(6);
  });
});
