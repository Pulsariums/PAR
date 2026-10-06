// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { encodePar, encodeXpar, estimatePar, indexAss, openPar, openXpar, parFileName, parHeader, Sha256, sniff, toHex, XparError } from '../src/format';
import { bakePar } from '../src/format/bake';

import { SAMPLE } from './fixtures';
import { profileText, SMALL, te } from './format-helpers';

vi.setConfig({ testTimeout: 60_000 });
describe('product API', () => {
  it('SHA-256 matches the known vectors, also when fed in odd slices', () => {
    expect(toHex(new Sha256().digest())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(toHex(new Sha256().update(te.encode('abc')).digest())).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const long = te.encode('a'.repeat(1_000_000));
    const h = new Sha256();
    for (let i = 0; i < long.length; i += 977) h.update(long.subarray(i, i + 977));
    expect(toHex(h.digest())).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });

  it('xpar: toAss() is byte exact and checked against the stored hash', async () => {
    const text = profileText('a-text-24');
    const x = await encodeXpar(te.encode(text), SMALL);
    const f = await openXpar(x);
    expect(f.lossy).toBe(false);
    expect(await f.toAss()).toEqual(te.encode(text));
    const h = parHeader(f);
    expect(h.lossy).toBe(false);
    expect(h.sourceSha256).toBe(toHex(new Sha256().update(te.encode(text)).digest()));
    expect(sniff(x)).toMatchObject({ kind: 'xpar', stored: false });
  });

  it('par: header says lossy, fps, source hash and duration; toAss() refuses; openPar refuses xpar', async () => {
    const text = profileText('a-text-24');
    const { bytes } = await bakePar(te.encode(text), { fps: 24 }, SMALL);
    const { file, header } = await openPar(bytes);
    expect(header).toMatchObject({ lossy: true, fps: 24, sourceBytes: te.encode(text).length });
    expect(header.sourceSha256).toBe(toHex(new Sha256().update(te.encode(text)).digest()));
    expect(header.notice).toMatch(/cannot be reproduced/);
    expect(header.sourceDuration).toBeGreaterThan(1);
    await expect(file.toAss()).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    expect((await file.toBakedAss()).length).toBeGreaterThan(1000);
    expect(sniff(bytes).kind).toBe('par');
    await expect(openPar(await encodeXpar(te.encode(text), SMALL))).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    expect(parFileName('episode01', 24)).toBe('episode01.24fps.par');
  });

  it('sniffs ass text and unknown data', () => {
    expect(sniff(te.encode(SAMPLE)).kind).toBe('ass');
    expect(sniff(te.encode('hello world')).kind).toBe('unknown');
    expect(sniff(new Uint8Array(0)).kind).toBe('unknown');
  });

  it('never larger than the input + 20 bytes (stored form), still round-trips', async () => {
    for (const s of ['', 'x', SAMPLE, '[Script Info]\nTitle: t\n', 'random \u0000\u0001 junk']) {
      const input = te.encode(s);
      const x = await encodeXpar(input);
      expect(x.length).toBeLessThanOrEqual(input.length + 20);
      expect(sniff(x).kind === 'xpar' || x.length === 0).toBe(true);
      expect(await (await openXpar(x)).toAss()).toEqual(input);
    }
    expect(sniff(await encodeXpar(te.encode('x'))).stored).toBe(true);
  });

  it('progress callback and AbortSignal', async () => {
    const bytes = te.encode(profileText('a-text-24'));
    const seen: number[] = [];
    await encodePar(bytes, { fps: 24 }, { ...SMALL, onProgress: (p) => void seen.push(p.fraction ?? -1) });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(1);
    const ac = new AbortController();
    let calls = 0;
    const run = encodeXpar(bytes, { ...SMALL, signal: ac.signal, onProgress: () => (++calls === 1 ? ac.abort() : undefined) });
    await expect(run).rejects.toBeInstanceOf(XparError);
    await expect(run).rejects.toMatchObject({ code: 'ABORTED' });
    const ac2 = new AbortController();
    ac2.abort();
    await expect(encodePar(bytes, { fps: 24 }, { signal: ac2.signal })).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('estimatePar lands near the real size and reports that it is an estimate', async () => {
    const text = profileText('a-text-24');
    const real = (await bakePar(te.encode(text), { fps: 24 })).bytes.length;
    const ix = await indexAss(new Blob([text]), { rangeBytes: 64 * 1024 });
    const est = await estimatePar(ix, { fps: 24 }, 4);
    expect(est.isEstimate).toBe(true);
    expect(Math.abs(est.approxBytes - real) / real).toBeLessThan(0.35);
    expect(est.lowBytes).toBeLessThanOrEqual(est.approxBytes);
    expect(est.highBytes).toBeGreaterThanOrEqual(est.approxBytes);
    expect(est.sampledFraction).toBeGreaterThan(0);
  });
});
