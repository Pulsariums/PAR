// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { decodeBlock } from '../src/format/codec';
import { openXpar, encodeXpar } from '../src/format';
import { ByteWriter } from '../src/format/bytes';
import { rcDecode, rcEncode } from '../src/format/rc';
import { rcDecodeFast, rcEncodeFast } from '../src/format/rcFast';
import { kernels, setWasmEnabled } from '../src/wasm/load';

import { profileText, same, SMALL, te } from './format-helpers';

vi.setConfig({ testTimeout: 120_000 });

/** A raw block: stream table (count, key, len)* then the bodies, as `StreamWriter.serialize` writes it. */
const block = (streams: Array<[number, Uint8Array]>): Uint8Array => {
  const h = new ByteWriter(16);
  h.uv(streams.length);
  for (const [k, b] of streams) (h.uv(k), h.uv(b.length));
  const out = new Uint8Array(h.len + streams.reduce((n, [, b]) => n + b.length, 0));
  out.set(h.view());
  let p = h.len;
  for (const [, b] of streams) (out.set(b, p), (p += b.length));
  return out;
};

const rng = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const varints = (r: () => number, n: number, spread: number): Uint8Array => {
  const w = new ByteWriter(64);
  for (let i = 0; i < n; i++) w.uv(r() < 0.4 ? Math.floor(r() * 4) : Math.floor(r() ** spread * 2 ** (r() < 0.02 ? 50 : 20)));
  return w.view().slice();
};

const bytes = (r: () => number, n: number): Uint8Array => Uint8Array.from({ length: n }, () => (r() < 0.5 ? 97 + Math.floor(r() * 5) : Math.floor(r() * 256)));

const outcome = async (f: () => Promise<Uint8Array> | Uint8Array): Promise<string> => {
  try {
    return [...(await f())].join(',');
  } catch (e) {
    return `ERR ${(e as Error).message}`;
  }
};

describe('WebAssembly stream coder is bit-identical to the TypeScript one', () => {
  it('the module loads here (otherwise these tests prove nothing)', async () => {
    expect(await kernels()).not.toBeNull();
  });

  it('real chunks of every benchmark profile: same bytes both ways, round trip', async () => {
    for (const id of ['a-text-24', 'b-draw-24', 'c-episode']) {
      setWasmEnabled(false);
      const x = await encodeXpar(te.encode(profileText(id)), id === 'c-episode' ? {} : SMALL);
      const f = await openXpar(x);
      let n = 0;
      for (const c of f.chunks) {
        if (c.codec !== 2) continue;
        const raw = await decodeBlock(x.subarray(c.offset, c.offset + c.len), c.codec, c.rawLen);
        setWasmEnabled(true);
        const ts = rcEncode(raw);
        const w = await rcEncodeFast(raw);
        expect(same(ts, w)).toBe(true);
        expect(same(await rcDecodeFast(ts, raw.length), raw)).toBe(true);
        expect(same(rcDecode(w, raw.length), raw)).toBe(true);
        n++;
      }
      expect(n).toBeGreaterThan(0);
    }
  });

  it('fuzzed stream sets (canonical, padded and oversized varints, string streams, empty streams)', async () => {
    setWasmEnabled(true);
    const r = rng(12345);
    for (let t = 0; t < 120; t++) {
      const streams: Array<[number, Uint8Array]> = [];
      for (let s = 0, n = 1 + Math.floor(r() * 12); s < n; s++) {
        const key = r() < 0.3 ? 4 : Math.floor(r() * 200);
        const kind = r();
        const body = kind < 0.6 ? varints(r, Math.floor(r() * 400), 1 + r() * 4) : kind < 0.8 ? bytes(r, Math.floor(r() * 300)) : kind < 0.9 ? Uint8Array.of(0x80, 0x00, 5, 0xff) : new Uint8Array(0);
        streams.push([key, body]);
      }
      const raw = block(streams);
      const ts = rcEncode(raw);
      expect(same(ts, await rcEncodeFast(raw))).toBe(true);
      expect(same(await rcDecodeFast(ts, raw.length), raw)).toBe(true);
    }
  });

  it('damaged coded data decodes to the same bytes or the same error', async () => {
    setWasmEnabled(true);
    const r = rng(777);
    for (let t = 0; t < 150; t++) {
      const raw = block([[8, varints(r, 200, 2)], [4, bytes(r, 150)], [70, varints(r, 100, 3)]]);
      const coded = rcEncode(raw).slice();
      const head = coded.length - 1;
      for (let k = 0, n = 1 + Math.floor(r() * 4); k < n; k++) coded[Math.floor(r() * head)] ^= 1 << Math.floor(r() * 8);
      const cut = r() < 0.3 ? coded.subarray(0, Math.floor(r() * coded.length)) : coded;
      const a = await outcome(() => rcDecode(cut, raw.length));
      const b = await outcome(() => rcDecodeFast(cut, raw.length));
      expect(b).toBe(a);
    }
  });

  it('a block that expands (incompressible bytes) survives the output-buffer retry', async () => {
    setWasmEnabled(true);
    const r = rng(9);
    const noise = Uint8Array.from({ length: 40000 }, () => Math.floor(r() * 256));
    const raw = block([[4, noise], [9, noise.subarray(0, 5000)]]);
    expect(same(rcEncode(raw), await rcEncodeFast(raw))).toBe(true);
  });

  it('with WebAssembly switched off the same files come out', async () => {
    const raw = block([[8, varints(rng(3), 500, 2)], [4, bytes(rng(4), 400)]]);
    setWasmEnabled(true);
    const on = await rcEncodeFast(raw);
    setWasmEnabled(false);
    expect(same(on, await rcEncodeFast(raw))).toBe(true);
    expect(same(await rcDecodeFast(on, raw.length), raw)).toBe(true);
    setWasmEnabled(true);
  });
});
