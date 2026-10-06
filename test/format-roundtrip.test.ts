// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { SAMPLE } from './fixtures';
import { PROFILE_SECONDS, profileText, roundTrip, SMALL, te } from './format-helpers';

vi.setConfig({ testTimeout: 60_000 });
const MIN_RATIO: Record<string, number> = { 'c-episode': 1.5, 'b-draw-24': 2.2 };
describe('xpar lossless round-trip (byte exact)', () => {
  it('fixture (BOM + CRLF)', async () => {
    for (const codec of ['rc', 'deflate', 'stored'] as const) expect((await roundTrip(te.encode(SAMPLE), { codec })).ok).toBe(true);
  });

  for (const id of Object.keys(PROFILE_SECONDS)) {
    it(`benchmark profile ${id}`, async () => {
      const bytes = te.encode(profileText(id));
      const { ok, xpar } = await roundTrip(bytes, SMALL);
      expect(ok).toBe(true);
      expect(xpar.length).toBeLessThan(bytes.length / (MIN_RATIO[id] ?? 3));
    });
  }

  const odd: Record<string, string> = {
    empty: '',
    'only newline': '\n',
    'only crlf': '\r\n',
    'no final newline': '[Script Info]\nTitle: x',
    'trailing CR without LF': '[Script Info]\nTitle: x\r',
    'mixed eol': '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,D,,0,0,0,,a\r\nDialogue: 0,0:00:02.00,0:00:03.00,D,,0,0,0,,b\n\r\n',
    'lone CR': 'a\rb\rc',
    'BOM only': '﻿',
    'no sections': 'hello\nworld\n',
    'unknown sections': '[Weird Stuff]\nDialogue: 0,0:00:01.00,0:00:02.00,D,,0,0,0,,not in events\n[Fonts]\nfontname: x\nABCD\n',
    'non canonical': '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 00,0:0:1.0,0:00:02.00,D,,0,0,0,,x\nDialogue:  0,0:00:01.00,0:00:02.00,D,,0,0,0,,double space\nDialogue: 0,0:00:01.00,0:00:02.00,D,,0,0,0,,{\\pos(1,2)\\fscx100.50\\foo\\1c&Hff00ff&\\t(0,1,\\blur-.5)}t,e\\Nx\n',
    'tag corner cases': '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,D,,0,0,0,,{\\p1}m 0 0 l 1.5 2 {\\p0}x{\\clip(1,m 0 0 l 5 5)}{\\an8 comment}{unclosed\\pos(1,2) {\\i1}{}{\\t(\\fs10)}{\\move(1,2,3,4,5,6)}\n',
    'nonstandard format': '[Events]\nFormat: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: Marked=0,0:00:01.00,0:00:02.00,D,,0,0,0,,x\nDialogue: Marked=0,bad,0:00:02.00,D,,0,0,0,,badtime\n',
    'dialogue before format': '[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,D,,0,0,0,,x\nComment: 0,0:00:01.00,0:00:02.00,D,,0,0,0,,c\n',
    'negative and huge numbers': '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: -3,9:59:59.99,0:00:00.00,D,n,0,0,0,e,{\\pos(-99999999999999999,1e9)\\frz-0}x\n',
  };
  for (const [name, text] of Object.entries(odd)) {
    it(`odd input: ${name}`, async () => {
      expect((await roundTrip(te.encode(text), SMALL)).ok).toBe(true);
    });
  }

  it('invalid UTF-8 and binary bytes survive', async () => {
    const b = Uint8Array.from([0x5b, 0x45, 0x76, 0x5d, 10, 0xff, 0xfe, 0xc3, 0x28, 10, 0, 1, 2, 3, 13, 10, 0x44]);
    expect((await roundTrip(b)).ok).toBe(true);
    const all = Uint8Array.from({ length: 256 }, (_v, i) => i);
    expect((await roundTrip(all)).ok).toBe(true);
  });

  it('a 5 MB single line', async () => {
    const big = te.encode(`[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,D,,0,0,0,,${'x{\\b1}'.repeat(800_000)}\n`);
    expect((await roundTrip(big)).ok).toBe(true);
  });

  it('streams the input in awkward slices (BOM split, CRLF split)', async () => {
    const { encodeXpar, openXpar, decodeXpar } = await import('../src/format');
    const bytes = te.encode(SAMPLE);
    const slices = async function* () {
      for (let i = 0; i < bytes.length; i += 7) yield bytes.subarray(i, i + 7);
    };
    const out = await decodeXpar(await openXpar(await encodeXpar(slices())));
    expect(out).toEqual(bytes);
  });
});
