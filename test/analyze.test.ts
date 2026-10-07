import { describe, expect, it } from 'vitest';

import { Series } from '../src/analyze/bins';
import { findBursts } from '../src/analyze/bursts';
import { dialogues, readHead } from '../src/analyze/stream';
import { analyzeAss, analyzeSource, summaryText } from '../src/analyze';
import { parseScript } from '../src/parser/ScriptParser';
import { fromAssText } from '../src/source/fromText';

const HEAD = '[Script Info]\nScriptType: v4.00+\nPlayResX: 640\nPlayResY: 360\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,40,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,10,10,10,1\nStyle: Unused,Courier New,30,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,10,10,10,1\n\n[Fonts]\nfontname: x.ttf\nAAAA\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
const d = (s: string, e: string, text: string, st = 'Default'): string => `Dialogue: 0,${s},${e},${st},,0,0,0,,${text}\n`;
// 300 particles appear at 2.0 s (out of file order), a few plain lines elsewhere.
const script = (): string => {
  let t = HEAD + d('0:00:00.00', '0:00:01.00', '{\\an5\\pos(10,10)}Hello') + 'Comment: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,skip\n';
  for (let i = 0; i < 300; i++) t += d('0:00:02.00', '0:00:03.00', `{\\an5\\pos(${i},50)\\blur${1 + (i % 5)}\\fad(0,200)}K`);
  t += d('0:00:00.50', '0:00:01.50', '{\\k20}karaoke') + d('0:00:01.00', '0:00:02.00', '{\\an5\\pos(1,1)\\p1}m 0 0 l 5 5');
  return t;
};

describe('analyze: pure pieces', () => {
  it('Series grows sparsely and finds the max without spreading', () => {
    const s = new Series(2);
    s.add(1_000_000, 5);
    s.add(3, 9);
    expect(s.length).toBe(1_000_001);
    expect(s.max()).toEqual({ v: 9, at: 3 });
    expect(s.sum(0, 10)).toBe(9);
    const run = new Series();
    run.add(2, 1); run.add(5, -1);
    const v = run.running();
    expect([v.get(1), v.get(2), v.get(4), v.get(5)]).toEqual([0, 1, 1, 0]);
  });

  it('bursts: a jump over several frames is one burst, with its new sprites and cost', () => {
    const vis = new Series();
    [0, 0, 10, 12, 300, 700, 900, 900, 800, 300, 20, 20].forEach((v, i) => vis.add(i, v));
    const nk = new Series(), cost = new Series();
    nk.add(4, 100); nk.add(5, 300); nk.add(40, 7); cost.add(4, 10); cost.add(5, 30); cost.add(40, 99);
    const b = findBursts(vis, 40, 24, nk, cost);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ before: 12, peak: 900, newKeys: 400, buildMs: 40 });
    expect(b[0].at).toBeCloseTo(4 / 24, 3);
  });

  it('streams the same events (ids, indexes) as parseScript and skips [Fonts]', () => {
    const text = script();
    const full = parseScript(text);
    const head = readHead(text);
    expect([...head.script.styles.keys()]).toEqual([...full.styles.keys()]);
    const got = [...dialogues(text, head.fields)].map((x) => x.ev);
    expect(got.map((e) => e.id)).toEqual(full.events.map((e) => e.id));
    expect(got.map((e) => [e.start, e.end, e.style])).toEqual(full.events.map((e) => [e.start, e.end, e.style]));
  });
});

describe('analyze: report', () => {
  it('finds the burst, the first use of every key, why events do not qualify and unused styles', async () => {
    const r = await analyzeAss(script(), { fps: 24, width: 640 });
    expect(r.schema).toBe('par-analyze/1');
    expect(r.input.events).toBe(303);
    expect(r.peak).toEqual({ visible: 300, at: 2 });
    expect(r.bursts).toHaveLength(1);
    expect(r.bursts[0]).toMatchObject({ at: 2, peak: 300 });
    expect(r.canvas.reasons).toMatchObject({ karaoke: 1, drawing: 1 });
    expect(r.canvas.events).toBe(301);
    expect(r.styles.unused).toEqual(['Unused']);
    expect(r.styles.unusedFonts).toEqual(['Courier New']);
    // 5 blur values x one animated fade: few distinct keys, all first used at 2 s (or the plain line at 0)
    expect(r.sprites.distinct).toBeGreaterThan(1);
    expect(r.sprites.distinct).toBeLessThan(40);
    expect(r.keys.every((k) => k.at === 0 || k.at >= 2)).toBe(true);
    expect(r.keys.map((k) => k.at)).toEqual(r.keys.map((k) => k.at).sort((a, b) => a - b));
    const s2 = r.seconds.find((x) => x.s === 2)!;
    expect(s2.starts).toBe(300);
    expect(s2.visible).toBe(300);
    expect(s2.newKeys).toBeGreaterThan(0);
    expect(r.bursts[0].buildMs).toBeGreaterThan(0);
    expect(summaryText(r)).toContain('canvas path');
  });

  it('a source and the text give the same numbers (windows do not double count events that span them)', async () => {
    const text = script();
    const a = await analyzeAss(text, { fps: 24, chains: false });
    const b = await analyzeSource(fromAssText(text), { fps: 24, windowSeconds: 1 });
    expect({ ...b, input: { ...b.input, bytes: null } }).toEqual({ ...a, input: { ...a.input, bytes: null } });
    expect(b.chains).toBeNull();
  });

  it('a big script does not overflow the stack and honours the key cap and cancel', async () => {
    let t = HEAD;
    for (let i = 0; i < 20000; i++) t += d('0:00:01.00', '0:00:02.00', `{\\an5\\pos(${i % 600},${i % 300})\\blur${(i % 97) / 10}}K`);
    const r = await analyzeAss(t, { maxKeys: 50, chains: false });
    expect(r.sprites.distinct).toBe(50);
    expect(r.sprites.keysCapped).toBe(true);
    expect(r.peak.visible).toBe(20000);
    const ac = new AbortController();
    ac.abort();
    await expect(analyzeAss(t, { signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('analyze panel helpers', () => {
  it('names the JSON next to the file', async () => {
    const { analyzeName } = await import('../site/src/studio/analyze/ui');
    expect(analyzeName('ep01.ass')).toBe('ep01.par-analyze.json');
    expect(analyzeName('ep01.24fps.par')).toBe('ep01.24fps.par-analyze.json');
  });
});
