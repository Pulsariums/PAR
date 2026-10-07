import { describe, expect, it } from 'vitest';

import { optimizeAss } from '../src/optimize';
import { parseScript } from '../src/parser/ScriptParser';

import { dump, fbfLines, HEAD, script, type Shown } from './helpers/fbf';

const lineCount = (t: string): number => t.split('\n').filter((l) => l.startsWith('Dialogue:')).length;

/** Every frame: the same events in the same drawing order, each number within `tol` (default: what 'invisible' allows for a one-letter event: 1/8 px). */
const INVISIBLE = { pos: 0.126, deg: 0.12, scale: 0.27, chan: 2 };
const same = (a: Shown[][], b: Shown[][], tol = INVISIBLE): void => {
  expect(b.length).toBe(a.length);
  a.forEach((fa, k) => {
    const fb = b[k];
    expect(fb.map((s) => s.text), `frame ${k}: same events`).toEqual(fa.map((s) => s.text));
    fa.forEach((x, i) => {
      const y = fb[i];
      if (x.pos && y.pos) { expect(Math.abs(x.pos[0] - y.pos[0]), `x @${k}`).toBeLessThanOrEqual(tol.pos); expect(Math.abs(x.pos[1] - y.pos[1]), `y @${k}`).toBeLessThanOrEqual(tol.pos); } else expect(!!x.pos).toBe(!!y.pos);
      for (const key of ['frz', 'frx', 'fry']) expect(Math.abs(x.st[key] - y.st[key]), `${key} @${k}`).toBeLessThanOrEqual(tol.deg);
      for (const key of ['fscx', 'fscy']) expect(Math.abs(x.st[key] - y.st[key]), `${key} @${k}`).toBeLessThanOrEqual(tol.scale);
      for (const key of ['a1', 'a2', 'a3', 'a4']) expect(Math.abs(x.st[key] - y.st[key]), `${key} @${k}`).toBeLessThanOrEqual(tol.chan);
      for (const key of ['c1', 'c2', 'c3', 'c4']) for (let sh = 0; sh <= 16; sh += 8) expect(Math.abs(((x.st[key] >> sh) & 255) - ((y.st[key] >> sh) & 255)), `${key} @${k}`).toBeLessThanOrEqual(tol.chan);
    });
  });
};

const linear = (n: number) => ({ frames: n, tags: (k: number) => `\\pos(${(100 + 7.5 * k).toFixed(1)},${(200 - 3 * k).toFixed(1)})\\frz${(k * 2).toFixed(2)}\\fscx${100 + k}\\1c&H${(k * 4).toString(16).toUpperCase().padStart(2, '0')}20FF&\\1a&H${(k * 3).toString(16).toUpperCase().padStart(2, '0')}&` });

describe('optimizeAss', () => {
  it('turns 60 frames of linear motion, rotation, scale, colour and alpha into one event that looks the same on every frame', async () => {
    const src = script(fbfLines(linear(60)));
    const { text, stats } = await optimizeAss(src, { fps: 24 });
    expect(lineCount(src)).toBe(60);
    expect(lineCount(text)).toBe(1);
    expect(stats).toMatchObject({ eventsIn: 60, eventsOut: 1, chains: 1, merged: 1, removed: 59, rejected: 0, orderConflicts: 0 });
    expect(text).toMatch(/\\move\(/);
    expect(text).toMatch(/\\t\(/);
    expect(text.startsWith(HEAD)).toBe(true);
    same(dump(src, 24, 62), dump(text, 24, 62));
    expect(parseScript(text).events).toHaveLength(1);
  });

  it('cuts a curved path into a few straight pieces, each within tolerance, and says so in the stats', async () => {
    const src = script(fbfLines({ frames: 96, text: 'S', tags: (k) => `\\pos(${(300 + 200 * Math.sin(k / 40)).toFixed(2)},${(400 + 150 * Math.cos(k / 50)).toFixed(2)})` }));
    const { text, stats } = await optimizeAss(src, { fps: 24 });
    expect(stats.eventsOut).toBeLessThan(40);
    expect(stats.eventsOut).toBeGreaterThan(2);
    expect(stats.rejected).toBe(0);
    expect(stats.worstError).toBeLessThanOrEqual(1);
    same(dump(src, 24, 98), dump(text, 24, 98));
  });

  it('exact mode merges only what a line reproduces (exactly linear integer motion), invisible mode also merges rounding noise', async () => {
    const exactSrc = script(fbfLines({ frames: 24, tags: (k) => `\\pos(${(100 + 0.04 * k).toFixed(2)},${(50 + 0.02 * k).toFixed(2)})` }));
    expect(lineCount((await optimizeAss(exactSrc, { fps: 24, mode: 'exact' })).text)).toBe(1);
    const noisy = script(fbfLines({ frames: 24, tags: (k) => `\\pos(${(100 + 3 * k + (k % 2 ? 0.04 : -0.04)).toFixed(2)},${50 + k})` }));
    expect(lineCount((await optimizeAss(noisy, { fps: 24, mode: 'exact' })).text)).toBeGreaterThan(1);
    const r = await optimizeAss(noisy, { fps: 24, mode: 'invisible' });
    expect(lineCount(r.text)).toBe(1);
    same(dump(noisy, 24, 26), dump(r.text, 24, 26));
  });

  it('merges identical static frames into one event', async () => {
    const src = script(fbfLines({ frames: 30, tags: () => '\\pos(640,360)\\fscx120' }));
    const { text, stats } = await optimizeAss(src, { fps: 24 });
    expect(stats.eventsOut).toBe(1);
    expect(text).not.toMatch(/\\move|\\t\(/);
    same(dump(src, 24, 32), dump(text, 24, 32));
  });

  it('does not join events that are not contiguous or not the same shape', async () => {
    const gap = [...fbfLines({ frames: 5, tags: (k) => `\\pos(${10 * k},5)` }), ...fbfLines({ frames: 5, from: 7, tags: (k) => `\\pos(${100 + 10 * k},5)` })];
    const r = await optimizeAss(script(gap), { fps: 24 });
    expect(r.stats.eventsOut).toBe(2);
    const mixed = fbfLines({ frames: 6, tags: (k) => `\\pos(${10 * k},5)`, text: 'A' }).map((l, i) => (i % 2 ? l.replace('}A', '}B') : l));
    expect(lineCount((await optimizeAss(script(mixed), { fps: 24 })).text)).toBe(6);
  });

  it('keeps several particles of one shape apart (they move at the same time)', async () => {
    const lines = [0, 1, 2].flatMap((p) => fbfLines({ frames: 20, tags: (k) => `\\pos(${200 * p + 5 * k},${100 * p + 2 * k})` }));
    // interleave frame by frame like an exporter does
    const byFrame = Array.from({ length: 20 }, (_, k) => [0, 1, 2].map((p) => lines[p * 20 + k])).flat();
    const src = script(byFrame);
    const { text, stats } = await optimizeAss(src, { fps: 24 });
    expect(stats.eventsOut).toBe(3);
    same(dump(src, 24, 22), dump(text, 24, 22));
  });

  it('refuses a merge that would change the drawing order of overlapping events', async () => {
    // A is drawn above B on the first frames and below it on the last ones: merging either at its first line would flip that.
    const a = fbfLines({ frames: 8, text: 'A', tags: (k) => `\\pos(${10 * k},0)` });
    const b = fbfLines({ frames: 8, text: 'B', tags: (k) => `\\pos(${10 * k},0)` });
    const lines: string[] = [];
    for (let k = 0; k < 8; k++) lines.push(...(k < 4 ? [b[k], a[k]] : [a[k], b[k]]));
    const src = script(lines);
    const { text, stats } = await optimizeAss(src, { fps: 24 });
    expect(stats.orderConflicts).toBeGreaterThan(0);
    same(dump(src, 24, 10), dump(text, 24, 10));
  });

  it('writes a merged event where it keeps its place, not necessarily where its first frame was', async () => {
    // The sign S (one frame, line 5) is drawn below the particle on frame 2 only: the merged particle must come after that line.
    const a = fbfLines({ frames: 8, text: 'A', tags: (k) => `\\pos(${10 * k},0)` });
    const s1 = fbfLines({ frames: 1, from: 2, layer: 0, text: 'S', tags: () => '\\pos(20,0)' })[0];
    const lines = [...a.slice(0, 2), s1, ...a.slice(2)];
    // order in the file: A0 A1 S A2 ... : on frame 2 S (line 2) is below A2 (line 3); on frames 0-1 S is not shown.
    const src = script(lines);
    const { text, stats } = await optimizeAss(src, { fps: 24 });
    expect(stats.merged).toBe(1);
    expect(lineCount(text)).toBe(2);
    expect(text.indexOf('}S')).toBeLessThan(text.indexOf('}A'));
    same(dump(src, 24, 10), dump(text, 24, 10));
  });

  it('keeps the order of overlapping events that were drawn A over B on some frames and B over A on others', async () => {
    const a = fbfLines({ frames: 6, text: 'A', tags: (k) => `\\pos(${k},0)` });
    const b = fbfLines({ frames: 6, text: 'B', tags: (k) => `\\pos(${k},0)` });
    const lines = [b[0], a[0], b[1], a[1], a[2], b[2], a[3], b[3], b[4], a[4], b[5], a[5]];
    const src = script(lines);
    const { text } = await optimizeAss(src, { fps: 24 });
    same(dump(src, 24, 8), dump(text, 24, 8));
  });

  it('leaves animated lines, drawings, comments, other layers\' order and the header untouched', async () => {
    const moving = 'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,{\\move(0,0,100,100)}moving';
    const timed = 'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\pos(5,5)\\t(0,500,\\frz90)}timed';
    const comment = 'Comment: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\pos(1,1)}note';
    const src = script([moving, timed, comment, ...fbfLines({ frames: 10, from: 48, tags: (k) => `\\pos(${k},0)` })]);
    const { text } = await optimizeAss(src, { fps: 24 });
    for (const l of [moving, timed, comment]) expect(text).toContain(l);
    expect(text.startsWith(HEAD)).toBe(true);
    expect(lineCount(text)).toBe(3);
  });

  it('returns scripts it cannot read safely unchanged (custom event format, no events)', async () => {
    const custom = HEAD.replace('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text', 'Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text') + 'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,x\n';
    expect((await optimizeAss(custom, { fps: 24 })).text).toBe(custom);
    expect((await optimizeAss(HEAD, { fps: 24 })).text).toBe(HEAD);
  });

  it('keeps CRLF line endings and the final newline', async () => {
    const src = script(fbfLines(linear(12)), '\r\n');
    const { text } = await optimizeAss(src, { fps: 24 });
    expect(text.includes('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
    expect(text.endsWith('\r\n')).toBe(true);
  });

  it('works at 30 and 23.976 fps and on a second layer', async () => {
    for (const fps of [30, 23.976]) {
      const src = script(fbfLines({ frames: 40, fps: Math.round(fps), layer: 3, tags: (k) => `\\pos(${k * 4},${k * 2})\\fscx${100 + k}` }));
      const { text, stats } = await optimizeAss(src, { fps });
      expect(stats.rejected).toBe(0);
      expect(lineCount(text)).toBeLessThan(40);
      same(dump(src, fps, 42), dump(text, fps, 42));
    }
  });

  it('reports progress and can be cancelled', async () => {
    const lines = Array.from({ length: 400 }, (_, p) => fbfLines({ frames: 6, text: 'p', tags: (k) => `\\pos(${p * 3 + k},${p})`, from: 0 })).flat();
    const seen: number[] = [];
    await optimizeAss(script(lines), { fps: 24, onProgress: (f) => seen.push(f) });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(1);
    const ac = new AbortController();
    ac.abort();
    await expect(optimizeAss(script(lines), { fps: 24, signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
