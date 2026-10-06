import { describe, expect, it } from 'vitest';

import { contentKey, parseFont } from '../src/fonts/loader';
import { FontRegistry } from '../src/fonts/registry';
import { buildTestFont } from '../src/fonts/testFont';

import { FakeHost } from './helpers/fakeFonts';

const face = async (family: string, weight = 400) => (await parseFont({ name: `${family}.ttf`, data: buildTestFont({ family, weight }) }))[0];

describe('FontRegistry', () => {
  it('registers identical bytes once and ref-counts per owner', async () => {
    const host = new FakeHost();
    const reg = new FontRegistry(() => host);
    const [a, b] = [{}, {}];
    const f = await face('Shared');
    const first = reg.acquire(a, f);
    const second = reg.acquire(b, await face('Shared'));
    await first.loaded;
    expect(second).toBe(first);
    expect(host.created).toHaveLength(1);
    expect(host.active.size).toBe(1);
    expect(reg.refCount(f.key)).toBe(2);
    reg.release(a, f.key);
    expect(host.active.size).toBe(1);
    reg.release(a, f.key); // double release is harmless
    expect(reg.refCount(f.key)).toBe(1);
    reg.release(b, f.key);
    expect(host.active.size).toBe(0);
    expect(reg.size).toBe(0);
  });

  it('registers under the detected family with weight/style descriptors', async () => {
    const host = new FakeHost();
    const reg = new FontRegistry(() => host);
    await reg.acquire({}, await face('Descr', 700)).loaded;
    expect(host.created[0]).toMatchObject({ family: 'Descr', weight: 700, italic: false });
    expect(host.created[0].bytes).toBeGreaterThan(500);
  });

  it('does not add a face that was released while it was still loading', async () => {
    const host = new FakeHost();
    host.hold = true;
    const reg = new FontRegistry(() => host);
    const owner = {};
    const f = await face('Late');
    const r = reg.acquire(owner, f);
    expect(r.state).toBe('loading');
    reg.release(owner, f.key);
    host.release();
    await r.loaded;
    expect(host.active.size).toBe(0);
  });

  it('marks undecodable fonts as failed and never adds them', async () => {
    const host = new FakeHost();
    host.failFor = () => true;
    const reg = new FontRegistry(() => host);
    const r = reg.acquire({}, await face('Bad'));
    await r.loaded;
    expect(r).toMatchObject({ state: 'failed', error: 'decode failed' });
    expect(host.active.size).toBe(0);
  });

  it('works without a browser (no FontFace): faces are simply "loaded"', async () => {
    const reg = new FontRegistry(() => null);
    expect(reg.acquire({}, await face('NoBrowser')).state).toBe('loaded');
  });

  it('content keys differ for different bytes and are stable for equal bytes', () => {
    const a = buildTestFont({ family: 'A' });
    expect(contentKey(a)).toBe(contentKey(a.slice()));
    expect(contentKey(a)).not.toBe(contentKey(buildTestFont({ family: 'B' })));
  });
});
