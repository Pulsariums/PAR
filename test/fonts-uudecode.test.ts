import { describe, expect, it } from 'vitest';

import { extractEmbeddedFiles, uudecode, uuencode, uudecodeLine } from '../src/fonts/uudecode';

const bytes = (n: number, seed = 7): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed + (i >> 3)) & 255);
const header = ['[Script Info]', 'Title: x', '', '[Fonts]'];

describe('uudecode (SSA/ASS variant)', () => {
  it('decodes a known group: chars offset 33, 4 chars => 3 bytes', () => {
    // 'Cat' = 0x43 0x61 0x74 => 010000 110110 000101 110100 => 16 54 5 52 => +33
    expect(Array.from(uudecodeLine(String.fromCharCode(16 + 33, 54 + 33, 5 + 33, 52 + 33)))).toEqual([0x43, 0x61, 0x74]);
  });

  it('handles partial last groups of 1 and 2 bytes', () => {
    for (const n of [1, 2, 3, 59, 60, 61, 119, 121]) {
      const data = bytes(n);
      expect(Array.from(uudecode(uuencode(data)))).toEqual(Array.from(data));
    }
    expect(uuencode(bytes(1))[0]).toHaveLength(2);
    expect(uuencode(bytes(2))[0]).toHaveLength(3);
    expect(uuencode(bytes(60))[0]).toHaveLength(80);
  });

  it('skips characters outside 33..96 instead of corrupting the stream', () => {
    const line = uuencode(bytes(9))[0];
    expect(Array.from(uudecodeLine(` ${line.slice(0, 4)}\t${line.slice(4)}`))).toEqual(Array.from(uudecodeLine(line)));
  });

  it('extracts several fonts, CRLF, and ignores [Graphics]', () => {
    const a = bytes(130, 1);
    const b = bytes(61, 2);
    const text = [
      ...header, 'fontname: Alpha_0.ttf', ...uuencode(a), '', 'fontname: Beta Font_0.otf', ...uuencode(b), '',
      '[Graphics]', 'filename: logo.png', ...uuencode(bytes(70, 3)), '', '[Events]', 'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,x',
    ].join('\r\n');
    const files = extractEmbeddedFiles(text);
    expect(files.map((f) => f.name)).toEqual(['Alpha_0.ttf', 'Beta Font_0.otf']);
    expect(Array.from(files[0].data)).toEqual(Array.from(a));
    expect(Array.from(files[1].data)).toEqual(Array.from(b));
  });

  it('keeps data lines that start with ";" or look like section headers', () => {
    // ';' (59) and '[' (91) are valid data characters: a comment/section splitter would drop or misread these lines.
    const lines = [';' + 'A'.repeat(79), '[' + 'B'.repeat(78) + ']', 'short'];
    const text = [...header, 'fontname: t.ttf', ...lines].join('\n');
    const [f] = extractEmbeddedFiles(text);
    expect(f.data).toEqual(uudecode(lines));
    expect(f.data.length).toBeGreaterThan(100);
  });

  it('a known header name inside the section ends the font', () => {
    const text = [...header, 'fontname: a.ttf', ...uuencode(bytes(10)), '[Events]', 'Format: x'].join('\n');
    expect(extractEmbeddedFiles(text)).toHaveLength(1);
  });

  it('returns nothing for scripts without [Fonts], and tolerates a BOM', () => {
    expect(extractEmbeddedFiles('[Script Info]\nTitle: x\n')).toEqual([]);
    const text = '﻿' + [...header, 'fontname: a.ttf', ...uuencode(bytes(5))].join('\n');
    expect(extractEmbeddedFiles(text)).toHaveLength(1);
  });

  it('is case-insensitive on [fonts] / Fontname:', () => {
    const text = ['[fonts]', 'FontName: X_0.ttf', ...uuencode(bytes(8))].join('\n');
    expect(extractEmbeddedFiles(text).map((f) => f.name)).toEqual(['X_0.ttf']);
  });
});
