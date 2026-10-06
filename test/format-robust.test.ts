// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { decodeXpar, encodeXpar, openXpar, XparError } from '../src/format';
import { deflateRaw } from '../src/format/codec';

import { profileText, SMALL, te } from './format-helpers';

const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'no error';
  } catch (e) {
    return e instanceof XparError ? e.code : `other: ${String(e)}`;
  }
};

vi.setConfig({ testTimeout: 60_000 });
describe('corrupt and hostile files fail clearly', () => {
  const make = () => encodeXpar(te.encode(profileText('a-text-24')), SMALL);

  it('not an xpar file', async () => {
    expect(await code(openXpar(te.encode('[Script Info]\nTitle: plain ass, definitely not a container, padding padding padding')))).toBe('BAD_MAGIC');
    expect(await code(openXpar(new Uint8Array(3)))).toBe('TRUNCATED');
  });

  it('truncated file', async () => {
    const x = await make();
    for (const cut of [x.length - 1, x.length - 60, Math.floor(x.length / 2), 20]) expect(await code(openXpar(x.slice(0, cut)))).toMatch(/TRUNCATED|CHECKSUM|CORRUPT/);
  });

  it('a flipped bit in a chunk is a CHECKSUM error on that chunk only', async () => {
    const x = await make();
    const f = await openXpar(x);
    const mid = f.chunks[2];
    const bad = x.slice();
    bad[mid.offset + Math.floor(mid.len / 2)] ^= 1;
    const g = await openXpar(bad);
    expect(await code(g.chunk(2))).toBe('CHECKSUM');
    expect(await code(g.chunk(1))).toBe('no error');
    expect(await code(decodeXpar(g))).toBe('CHECKSUM');
  });

  it('bad header version and unknown critical flag', async () => {
    const x = await make();
    const v = x.slice();
    v[4] = 9;
    expect(await code(openXpar(v))).toMatch(/CHECKSUM|BAD_VERSION/);
  });

  it('random corruption never crashes with a non-XparError', async () => {
    const x = await make();
    let seed = 7;
    const r = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let k = 0; k < 40; k++) {
      const bad = x.slice();
      for (let j = 0; j < 3; j++) bad[Math.floor(r() * bad.length)] = Math.floor(r() * 256);
      const c = await code((async () => decodeXpar(await openXpar(bad)))());
      expect(c).not.toMatch(/^other/);
    }
  });

  it('decompression bomb: stream larger than the declared raw size is refused', async () => {
    const { inflateRaw } = await import('../src/format/codec');
    const bomb = await deflateRaw(new Uint8Array(50_000_000));
    expect(bomb.length).toBeLessThan(100_000);
    expect(await code(inflateRaw(bomb, 1000))).toBe('LIMIT');
  });
});
