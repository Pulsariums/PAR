import { deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { readInputs } from '../src/fonts/input';
import { isZip, readZip } from '../src/fonts/zip';
import { buildTestFont } from '../src/fonts/testFont';

import { concat, record } from './helpers/bytes';

/** Minimal ZIP writer (central directory + local headers). */
const zip = (files: Array<{ name: string; data: Uint8Array; deflate?: boolean }>): Uint8Array<ArrayBuffer> => {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let off = 0;
  for (const f of files) {
    const body = f.deflate ? deflateRawSync(f.data) : f.data;
    const name = new TextEncoder().encode(f.name);
    const lh = record(30);
    lh.v.setUint32(0, 0x04034b50, true); lh.v.setUint16(4, 20, true); lh.v.setUint16(8, f.deflate ? 8 : 0, true);
    lh.v.setUint32(18, body.length, true); lh.v.setUint32(22, f.data.length, true); lh.v.setUint16(26, name.length, true);
    const ch = record(46);
    ch.v.setUint32(0, 0x02014b50, true); ch.v.setUint16(4, 20, true); ch.v.setUint16(6, 20, true); ch.v.setUint16(10, f.deflate ? 8 : 0, true);
    ch.v.setUint32(20, body.length, true); ch.v.setUint32(24, f.data.length, true); ch.v.setUint16(28, name.length, true); ch.v.setUint32(42, off, true);
    parts.push(lh.b, name, body);
    central.push(ch.b, name);
    off += 30 + name.length + body.length;
  }
  const cd = concat(central);
  const end = record(22);
  end.v.setUint32(0, 0x06054b50, true); end.v.setUint16(8, files.length, true); end.v.setUint16(10, files.length, true);
  end.v.setUint32(12, cd.length, true); end.v.setUint32(16, off, true);
  return concat([...parts, cd, end.b]);
};

describe('zip reader', () => {
  const a = buildTestFont({ family: 'Zip A' });
  const b = buildTestFont({ family: 'Zip B' });

  it('reads stored and deflated entries and skips unwanted ones', async () => {
    const z = zip([{ name: 'fonts/A.ttf', data: a }, { name: 'B.otf', data: b, deflate: true }, { name: 'readme.txt', data: new TextEncoder().encode('hi') }]);
    expect(isZip(z)).toBe(true);
    const out = await readZip(z, (n) => /\.(ttf|otf)$/.test(n));
    expect(out.map((e) => e.name)).toEqual(['fonts/A.ttf', 'B.otf']);
    expect(Array.from(out[1].data)).toEqual(Array.from(b));
  });

  it('readInputs expands a zip into font files (names without folders)', async () => {
    const z = zip([{ name: 'x/A.ttf', data: a, deflate: true }, { name: 'x/skip.png', data: new Uint8Array(3) }]);
    const out = await readInputs(new Blob([z]));
    expect(out.map((o) => o.name)).toEqual(['A.ttf']);
    expect(Array.from(out[0].data)).toEqual(Array.from(a));
  });

  it('rejects garbage', async () => {
    await expect(readZip(new Uint8Array(100), () => true)).rejects.toThrow(/end-of-central-directory/);
    expect(isZip(a)).toBe(false);
  });
});
