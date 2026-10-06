// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { openXpar } from '../src/format';
import { bakePar, defaultParams, quanta } from '../src/format/bake';
import { parseScript } from '../src/parser/ScriptParser';

import { te } from './format-helpers';

vi.setConfig({ testTimeout: 60_000 });

const HEAD = '[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
const D = (a: string, b: string, text: string, extra = 'Default,Bob,0,0,0,Banner;1') => `Dialogue: 0,${a},${b},${extra.split(',')[0]},${extra.split(',')[1]},0,0,0,${extra.split(',')[5] ?? ''},${text}\n`;

const bake = async (body: string, fps = 24) => {
  const r = await bakePar(te.encode(HEAD + body), { fps });
  const f = await openXpar(r.bytes);
  const ev = (await f.readWindow(0, 1000)).map((e) => ({ s: e.start, e: e.end, text: e.text, name: e.name, effect: e.effect }));
  return { r, f, ev };
};

describe('lossy bake', () => {
  it('drops events that no frame shows, keeps those that do', async () => {
    const { ev, r } = await bake(D('0:00:01.01', '0:00:01.03', 'gone') + D('0:00:02.00', '0:00:02.10', 'kept'));
    expect(ev.map((e) => e.text)).toEqual(['kept']);
    expect(r.stats.dropped).toBe(1);
  });

  it('quantizes static events onto the frame grid without changing which frames show them', async () => {
    const { ev } = await bake(D('0:00:01.01', '0:00:01.99', 'x'));
    const [a] = ev;
    for (let k = 0; k < 60; k++) {
      const t = k / 24;
      expect(t >= a.s && t < a.e).toBe(t >= 1.01 && t < 1.99);
    }
  });

  it('merges adjacent identical positioned static lines but never animated or unpositioned ones', async () => {
    const pos = '{\\pos(10,20)}hi';
    const { ev, r } = await bake(D('0:00:01.00', '0:00:01.04', pos) + D('0:00:01.04', '0:00:01.08', pos) + D('0:00:01.08', '0:00:01.12', pos));
    expect(ev).toHaveLength(1);
    expect(r.stats.merged).toBe(2);
    const un = await bake(D('0:00:01.00', '0:00:01.04', 'plain') + D('0:00:01.04', '0:00:01.08', 'plain'));
    expect(un.ev).toHaveLength(2);
    const an = await bake(D('0:00:01.00', '0:00:01.50', '{\\pos(1,2)\\fad(100,100)}a') + D('0:00:01.50', '0:00:02.00', '{\\pos(1,2)\\fad(100,100)}a'));
    expect(an.ev).toHaveLength(2);
    expect(an.ev[0].s).toBe(1);
  });

  it('strips Comment lines, Name and Effect, ignored tags and comment blocks', async () => {
    const { ev, f } = await bake('Comment: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\pos(1,2)}hidden\n' + D('0:00:01.00', '0:00:02.00', '{note\\fe0\\foo1\\b1}x'));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ name: '', effect: '', text: '{\\b1}x' });
    expect(f.lossy).toBe(true);
  });

  it('rounds numbers within the stated tolerance', async () => {
    const q = quanta(defaultParams(24), 1920, 1080);
    expect(q.pos).toBe(0.1);
    const { ev } = await bake(D('0:00:01.00', '0:00:02.00', '{\\pos(100.13,200.37)\\frz12.3456\\fscx100.4321}t'));
    const t = parseScript(HEAD + `Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,${ev[0].text}`).events[0].lineTags.pos!;
    expect(Math.abs(t[0] - 100.13)).toBeLessThanOrEqual(0.125);
    expect(Math.abs(t[1] - 200.37)).toBeLessThanOrEqual(0.125);
  });

  it('collapses a one-frame \\move to \\pos at the sampled instant', async () => {
    const { ev, r } = await bake(D('0:00:01.01', '0:00:01.05', '{\\move(0,0,100,100,0,40)}m'));
    expect(ev[0].text).toMatch(/^\{\\pos\(/);
    expect(r.stats.collapsed).toBe(1);
  });

  it('keeps multi-frame animations parametric with their original times', async () => {
    const { ev } = await bake(D('0:00:01.01', '0:00:02.03', '{\\move(0,0,100,100)\\t(0,500,\\fscx150)}m'));
    expect(ev[0]).toMatchObject({ s: 1.01, e: 2.03 });
    expect(ev[0].text).toContain('\\move(0,0,100,100)');
    expect(ev[0].text).toContain('\\t(0,500,\\fscx150)');
  });

  it('refuses non-standard layouts instead of guessing', async () => {
    await expect(bakePar(te.encode('[Events]\nFormat: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: Marked=0,0:00:01.00,0:00:02.00,D,,0,0,0,,x\n'), { fps: 24 })).rejects.toMatchObject({ code: 'UNSUPPORTED' });
  });

  it('is deterministic', async () => {
    const body = D('0:00:01.00', '0:00:02.00', '{\\pos(1,2)}a') + D('0:00:03.00', '0:00:04.00', 'b');
    const a = await bakePar(te.encode(HEAD + body), { fps: 24 });
    const b = await bakePar(te.encode(HEAD + body), { fps: 24 });
    expect(a.bytes).toEqual(b.bytes);
  });
});
