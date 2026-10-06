// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { indexAss, openXpar, encodeXpar, urlSource, type ByteSource } from '../src/format';
import { parseScript } from '../src/parser/ScriptParser';

import { PROFILE_SECONDS, profileText, SMALL, te } from './format-helpers';

const expected = (text: string, t0: number, t1: number) => parseScript(text).events.filter((e) => e.start < t1 && e.end > t0);
vi.setConfig({ testTimeout: 60_000 });
const windows = (dur: number): Array<[number, number]> => [[0, 0.5], [dur / 3, dur / 3 + 0.04], [dur / 2, dur / 2 + 1], [dur - 0.3, dur + 5], [-5, dur + 5]];

/** Unsorted file with a long-lived sign in the middle: exercises lanes and out-of-order starts. */
const scrambled = (): string => {
  const lines = profileText('b-draw-24').split('\n');
  const idx = lines.findIndex((l) => l.startsWith('Dialogue:'));
  const ev = lines.slice(idx).filter(Boolean);
  const head = lines.slice(0, idx);
  const out = ev.filter((_l, i) => i % 3 === 0).concat(ev.filter((_l, i) => i % 3 !== 0));
  out.splice(40, 0, 'Dialogue: 9,0:00:00.10,0:30:00.00,Sign,,0,0,0,,{\\pos(5,5)}long sign');
  return [...head, ...out].join('\n') + '\n';
};

describe('window reads equal slicing the full parse', () => {
  const cases: Array<[string, () => string]> = [...Object.keys(PROFILE_SECONDS).map((id): [string, () => string] => [id, () => profileText(id)]), ['scrambled', scrambled]];
  for (const [name, make] of cases) {
    it(`xpar: ${name}`, async () => {
      const text = make();
      const f = await openXpar(await encodeXpar(te.encode(text), SMALL));
      expect(f.chunks.length).toBeGreaterThan(1);
      const dur = parseScript(text).events.reduce((m, e) => Math.max(m, e.end), 0);
      for (const [a, b] of windows(Math.min(dur, PROFILE_SECONDS[name] ?? 5))) expect(await f.readWindow(a, b)).toEqual(expected(text, a, b));
    });
    it(`plain-ASS index: ${name}`, async () => {
      const text = make();
      const ix = await indexAss(new Blob([text]), { rangeBytes: 8 * 1024 });
      expect(ix.ranges.length).toBeGreaterThan(1);
      const dur = parseScript(text).events.reduce((m, e) => Math.max(m, e.end), 0);
      for (const [a, b] of windows(Math.min(dur, PROFILE_SECONDS[name] ?? 5))) expect(await ix.readWindow(a, b)).toEqual(expected(text, a, b));
    });
  }

  it('a window decodes only the chunks it needs', async () => {
    const text = profileText('a-text-24');
    const x = await encodeXpar(te.encode(text), SMALL);
    let reads = 0;
    const src: ByteSource = { size: async () => x.length, read: async (o, l) => (reads++, x.subarray(o, o + l)) };
    const f = await openXpar(src);
    const before = reads;
    expect(before).toBeLessThanOrEqual(5);
    await f.readWindow(1, 1.05);
    const used = f.chunksFor(1, 1.05).length;
    expect(used).toBeLessThan(f.chunks.length / 3);
    expect(reads - before).toBe(used);
  });

  it('reads through HTTP Range (mocked fetch)', async () => {
    const text = profileText('c-episode');
    const x = await encodeXpar(te.encode(text), SMALL);
    const fetchImpl = async (_u: string, init?: { headers?: Record<string, string> }) => {
      const m = /bytes=(-?\d+)(?:-(\d+))?/.exec(init?.headers?.Range ?? '')!;
      const [s, e] = m[2] === undefined ? [x.length - 1, x.length - 1] : [Number(m[1]), Number(m[2])];
      return new Response(x.slice(s, e + 1), { status: 206, headers: { 'content-range': `bytes ${s}-${e}/${x.length}` } });
    };
    const f = await openXpar(urlSource('https://example.test/a.xpar', fetchImpl));
    expect(await f.readWindow(30, 40)).toEqual(expected(text, 30, 40));
  });
});
