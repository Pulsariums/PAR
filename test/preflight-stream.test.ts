import { describe, expect, it } from 'vitest';

import { prepareLine } from '../src/anim/Prepared';
import { linesFromChunks, parseScript, preflightScript } from '../src/index';
import { FontManager } from '../src/fonts/FontManager';
import { scanScript } from '../src/preflight/preflight';

import { generateLines, generateScript } from './helpers/gen';

const heap = (): number => (globalThis as unknown as { process: { memoryUsage(): { heapUsed: number } } }).process.memoryUsage().heapUsed;

describe('streaming scan equals the full parse', () => {
  it.each([1, 2, 3])('seed %i: same fonts, looks, styles, lines and characters as the renderer sees', async (seed) => {
    const text = generateScript(1500, seed);
    // the renderer's own path: parse everything, prepare every line, collect usage from the fragments
    const parsed = parseScript(text);
    const fm = new FontManager({ onChange: () => {} });
    fm.setScript(text, parsed.events.map((e) => prepareLine(e, parsed.styles, parsed.info)), parsed.styles);
    await fm.idle();
    const full = fm.fontUsage;
    const sc = await scanScript(text, {});
    expect([...sc.uses.keys()].sort()).toEqual([...full.keys()].sort());
    for (const [key, f] of full) {
      const s = sc.uses.get(key)!;
      expect([...s.looks.keys()].sort(), key).toEqual([...f.looks.keys()].sort());
      expect([...s.styles].sort(), key).toEqual([...f.styles].sort());
      expect(s.lineCount, key).toBe(f.lines.size);
      expect([...s.chars].sort((a, b) => a - b), key).toEqual([...f.chars].sort((a, b) => a - b));
      expect(s.sample).toEqual([...f.lines].sort((a, b) => a - b).slice(0, 8));
    }
    expect(sc.events).toBe(parsed.events.length);
    fm.dispose();
  });

  it('the same answer from a string, from lines and from arbitrary chunk borders', async () => {
    const text = generateScript(400, 9);
    const a = await preflightScript(text);
    const b = await preflightScript(text.split('\n'));
    const chunks = (async function* () { for (let i = 0; i < text.length; i += 37) yield text.slice(i, i + 37); })();
    const c = await preflightScript(linesFromChunks(chunks));
    const bytes = new TextEncoder().encode(text);
    const d = await preflightScript(linesFromChunks((async function* () { for (let i = 0; i < bytes.length; i += 101) yield bytes.subarray(i, i + 101); })()));
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(d).toEqual(a);
  });
});

describe('big scripts', () => {
  it('scans 600k events from a lazy iterator without holding the script (memory stays small)', async () => {
    const before = heap();
    let peak = 0;
    let lines = 0;
    const t0 = Date.now();
    const r = await preflightScript(generateLines(600000, 5), {
      onProgress: (n) => { lines = n; peak = Math.max(peak, heap() - before); },
    });
    expect(lines).toBeGreaterThan(600000);
    expect(r.stats.events).toBe(600000);
    expect(r.stats.fonts).toBeGreaterThan(5);
    // ~50 MB of script text went through; the scan itself may only keep tables and counters
    expect(peak).toBeLessThan(120 * 1024 * 1024);
    console.log(`600k events scanned in ${Date.now() - t0} ms, peak heap growth ${(peak / 1048576).toFixed(1)} MB`);
  }, 120000);

  it('can be aborted and reports progress', async () => {
    const ac = new AbortController();
    await expect(preflightScript(generateLines(200000, 2), { signal: ac.signal, onProgress: (n) => { if (n >= 40000) ac.abort(); } })).rejects.toThrow(/aborted/);
  }, 60000);
});
