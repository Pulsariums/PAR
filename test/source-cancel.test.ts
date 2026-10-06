// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { openXpar, encodeXpar } from '../src/format';
import { parseScript } from '../src/parser/ScriptParser';

import { profileText, SMALL, te } from './format-helpers';

vi.setConfig({ testTimeout: 60_000 });

describe('chunk reads', () => {
  it('a read whose signal is aborted rejects with AbortError instead of decoding on', async () => {
    const f = await openXpar(await encodeXpar(te.encode(profileText('c-episode')), SMALL));
    expect(f.chunks.length).toBeGreaterThan(2);
    const ac = new AbortController();
    const p = f.readWindow(0, 600, ac.signal);
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    await expect(f.readWindow(0, 1, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('decoded chunks stay cached (a re-read is warm) and an aborted read leaves the file usable', async () => {
    const text = profileText('c-episode');
    const f = await openXpar(await encodeXpar(te.encode(text), SMALL));
    const need = f.chunksFor(100, 101);
    expect(need.every((i) => !f.warm(i))).toBe(true);
    const ac = new AbortController();
    const dead = f.readWindow(100, 101, ac.signal).catch((e: Error) => e.name);
    ac.abort();
    expect(await dead).toBe('AbortError');
    const events = await f.readWindow(100, 101);
    expect(need.every((i) => f.warm(i))).toBe(true);
    expect(events).toEqual(parseScript(text).events.filter((e) => e.start < 101 && e.end > 100));
  });
});
