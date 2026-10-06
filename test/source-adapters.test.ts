// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { bakePar, encodeXpar } from '../src/format';
import { decodeXpar, openXpar } from '../src/format';
import { parseScript } from '../src/parser/ScriptParser';
import { attachSourceHost, fromAssFile, fromAssText, fromPar, fromXpar, inWindow, openSource, openSourceInWorker, type SubtitleSource } from '../src/source';
import type { AssEvent } from '../src/types/script';
import type { FromWorker, ToWorker } from '../src/source/protocol';

import { PROFILE_SECONDS, profileText, SMALL, te } from './format-helpers';

vi.setConfig({ testTimeout: 60_000 });

const reference = (text: string, t0: number, t1: number): AssEvent[] =>
  parseScript(text).events.filter((e) => inWindow(e, t0, t1)).sort((a, b) => a.index - b.index);

/** Unsorted file with a long-lived sign in the middle and a [Fonts] section. */
const scrambled = (): string => {
  const lines = profileText('b-draw-24').split('\n');
  const idx = lines.findIndex((l) => l.startsWith('Dialogue:'));
  const ev = lines.slice(idx).filter(Boolean);
  const out = ev.filter((_l, i) => i % 3 === 0).concat(ev.filter((_l, i) => i % 3 !== 0));
  out.splice(40, 0, 'Dialogue: 9,0:00:00.10,0:30:00.00,Sign,,0,0,0,,{\\pos(5,5)}long sign');
  return [...lines.slice(0, idx), ...out, '', '[Fonts]', 'fontname: a_0.ttf', '!!!!!!', '`', ''].join('\n');
};

const windows = (dur: number): Array<[number, number]> => [[0, 0.5], [dur / 3, dur / 3 + 0.04], [dur / 2, dur / 2 + 1], [dur - 0.3, dur + 5], [-5, dur + 5], [1, 1]];
const names = [...Object.keys(PROFILE_SECONDS), 'scrambled'];
const textOf = (n: string): string => (n === 'scrambled' ? scrambled() : profileText(n));

describe('SubtitleSource adapters: window == slice of the full parse', () => {
  for (const name of names) {
    it(`text / file / xpar: ${name}`, async () => {
      const text = textOf(name);
      const dur = parseScript(text).events.reduce((m, e) => Math.max(m, e.end), 0);
      const sources: SubtitleSource[] = [
        fromAssText(text),
        await fromAssFile(new Blob([text]), { rangeBytes: 8 * 1024 }),
        await fromXpar(await encodeXpar(te.encode(text), SMALL)),
      ];
      for (const s of sources) {
        expect(s.eventCount).toBe(parseScript(text).events.length);
        expect(s.duration).toBeCloseTo(dur, 3);
        expect(s.script.styles.size).toBe(parseScript(text).styles.size);
        for (const [a, b] of windows(Math.min(dur, PROFILE_SECONDS[name] ?? 5))) expect(await s.readWindow(a, b), `${s.kind} ${a}-${b}`).toEqual(reference(text, a, b));
      }
    });
  }

  it('par: window == slice of the baked script', async () => {
    const text = profileText('a-text-24');
    const par = (await bakePar(te.encode(text), { fps: 24 }, SMALL)).bytes;
    const baked = new TextDecoder().decode(await decodeXpar(await openXpar(par)));
    const s = await fromPar(par);
    expect(s.kind).toBe('par');
    for (const [a, b] of windows(2)) expect(await s.readWindow(a, b)).toEqual(reference(baked, a, b));
    await expect(fromPar(await encodeXpar(te.encode(text)))).rejects.toThrow(/lossless/);
  });

  it('the [Fonts] section reaches every adapter', async () => {
    const text = scrambled();
    const want = '[Fonts]\nfontname: a_0.ttf\n!!!!!!\n`';
    const got = [
      await fromAssText(text).fontSection!(),
      await (await fromAssFile(new Blob([text]))).fontSection!(),
      await (await fromXpar(await encodeXpar(te.encode(text), SMALL))).fontSection!(),
    ];
    for (const g of got) expect(g?.trim()).toBe(want);
    expect(await fromAssText(profileText('a-text-60')).fontSection!()).toBeNull();
  });

  it('reports stats and reads only the window from a file', async () => {
    const text = profileText('c-episode');
    const s = await fromAssFile(new Blob([text]), { rangeBytes: 4 * 1024 });
    const before = s.stats!();
    expect(before.bytesRead).toBe(0);
    await s.readWindow(100, 102);
    const after = s.stats!();
    expect(after.bytesRead).toBeGreaterThan(0);
    expect(after.bytesRead).toBeLessThan(text.length / 4);
    expect(after.decodeMs).toBeGreaterThan(0);
    expect(after.indexMs).toBeGreaterThan(0);
  });

  it('openSource sniffs content, not names', async () => {
    const text = profileText('a-text-60');
    expect((await openSource(new Blob([text]))).kind).toBe('ass-file');
    expect((await openSource(new Blob([(await encodeXpar(te.encode(text))) as BlobPart]))).kind).toBe('xpar');
    expect((await openSource(text)).kind).toBe('text');
    await expect(openSource(new Blob(['hello']))).rejects.toThrow(/not an ASS/);
  });

  it('cancels indexing', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(fromAssFile(new Blob([profileText('a-text-24')]), { signal: ac.signal })).rejects.toThrow(/cancel/);
  });
});

/** A Worker double that runs the host in-process (messages are cloned like a real Worker would). */
const fakeWorker = (): Worker => {
  const toMain: Array<(e: { data: unknown }) => void> = [];
  const toHost: Array<(e: { data: ToWorker }) => void> = [];
  attachSourceHost({
    postMessage: (m: FromWorker) => queueMicrotask(() => toMain.forEach((f) => f({ data: structuredClone(m) }))),
    addEventListener: (_t, fn) => { toHost.push(fn); },
  });
  return {
    postMessage: (m: ToWorker) => queueMicrotask(() => toHost.forEach((f) => f({ data: m }))),
    addEventListener: (t: string, fn: (e: { data: unknown }) => void) => { if (t === 'message') toMain.push(fn); },
    terminate: () => undefined,
  } as unknown as Worker;
};

describe('worker source (host protocol)', () => {
  it('opens, reports progress, reads windows, cancels and closes', async () => {
    const text = profileText('a-text-24');
    const progress: number[] = [];
    const s = await openSourceInWorker(new Blob([text]), { worker: fakeWorker, onProgress: (b) => progress.push(b) });
    expect(progress.length).toBeGreaterThan(0);
    expect(s.eventCount).toBe(parseScript(text).events.length);
    expect(await s.readWindow(0.5, 1.5)).toEqual(reference(text, 0.5, 1.5));
    expect(s.stats!().bytesRead).toBeGreaterThan(0);
    const ac = new AbortController();
    const p = s.readWindow(0, 1, ac.signal);
    ac.abort();
    await expect(p).rejects.toThrow();
    s.close?.();
  });

  it('falls back to this thread without a worker', async () => {
    const s = await openSourceInWorker(new Blob([profileText('a-text-60')]), { worker: null });
    expect(s.kind).toBe('ass-file');
  });

  it('a corrupt file is an error, not a hang', async () => {
    await expect(openSourceInWorker(new Blob(['nonsense']), { worker: fakeWorker })).rejects.toThrow(/not an ASS/);
  });
});
