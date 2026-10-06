import { describe, expect, it } from 'vitest';

import { preflightScript } from '../src/index';
import { buildTestFont } from '../src/fonts/testFont';
import { uuencode } from '../src/fonts/uudecode';

import { ass, dialogue, style } from './helpers/ass';

const names = (r: { resolved: Array<{ name: string }>; missing: Array<{ name: string }> }) => [...r.resolved, ...r.missing].map((e) => e.name).sort();

describe('preflightScript: which families a script uses', () => {
  it('reads style fonts, \\fn overrides, \\r style switches and ignores unused styles', async () => {
    const text = ass(
      [style('Default', 'Alpha'), style('Sign', 'Beta'), style('Unused', 'Gamma')],
      [dialogue('Default', 'Hi {\\fnDelta}there{\\rSign} and {\\r}back'), dialogue('Sign', 'only sign')],
    );
    const r = await preflightScript(text);
    expect(names(r)).toEqual(['Alpha', 'Beta', 'Delta']);
    expect(r.stats).toMatchObject({ events: 2, fonts: 3 });
    const delta = r.resolved.find((e) => e.name === 'Delta')!;
    expect(delta.styles).toEqual(['Default']);
    expect(delta.lineCount).toBe(1);
  });

  it('is case-insensitive, strips @, trims, and keeps the first spelling', async () => {
    const text = ass([style('Default', '@Some Font')], [dialogue('Default', 'a {\\fnsome font }b'), dialogue('Default', '{\\fn@SOME FONT}c')]);
    const r = await preflightScript(text);
    expect(names(r)).toEqual(['Some Font']);
    expect(r.resolved[0].lineCount).toBe(2);
  });

  it('skips drawings and whitespace-only text; \\fn inside \\t counts (libass applies it unconditionally); unclosed braces are plain text', async () => {
    const text = ass([style('Default', 'Real')], [
      dialogue('Default', '{\\p1\\fnDraw}m 0 0 l 10 10{\\p0}'),
      dialogue('Default', '{\\fnSpace} \\N\\h '),
      dialogue('Default', '{\\t(0,100,\\fnAnim\\fs30)}x'),
      dialogue('Default', '{\\fnBroken text'),
    ]);
    const r = await preflightScript(text);
    expect(names(r)).toEqual(['Anim', 'Real']); // an unclosed brace is plain text, drawn in the line's font
  });

  it('handles \\b / \\i overrides and flags synthetic bold and italic (not missing)', async () => {
    const regular = buildTestFont({ family: 'Reg Only', weight: 400 });
    const text = ass([style('Default', 'Reg Only')], [dialogue('Default', 'x{\\b1}bold{\\b0\\i1}italic')]);
    const r = await preflightScript(text, { fonts: [regular] });
    expect(r.ok).toBe(true);
    expect(r.synthetic).toHaveLength(1);
    expect(r.synthetic[0]).toMatchObject({ name: 'Reg Only', status: 'user', syntheticBold: true, syntheticItalic: true });
  });

  it('a real bold face is not synthetic', async () => {
    const fonts = [buildTestFont({ family: 'Fam', weight: 400 }), buildTestFont({ family: 'Fam', weight: 700 })];
    const r = await preflightScript(ass([style('Default', 'Fam', -1)], [dialogue('Default', 'x')]), { fonts });
    expect(r.synthetic).toEqual([]);
    expect(r.resolved[0].status).toBe('user');
  });

  it('embedded [Fonts] resolve as embedded; embeddedFonts:false ignores them', async () => {
    const font = buildTestFont({ family: 'Emb Face' });
    const extra = ['[Fonts]', 'fontname: Emb Face_0.ttf', ...uuencode(font), ''].join('\n');
    const text = ass([style('Default', 'Emb Face')], [dialogue('Default', 'x')], extra);
    expect((await preflightScript(text)).resolved[0].status).toBe('embedded');
    expect((await preflightScript(text, { embeddedFonts: false })).resolved[0].status).toBe('system');
  });

  it('fontMap marks the entry as mapped; usedFonts merges without any text', async () => {
    const r = await preflightScript(null, { usedFonts: ['@Foo', { family: 'Bar', bold: true, italic: true }], fontMap: { foo: 'Mapped, serif' } });
    expect(r.resolved.find((e) => e.name === 'Foo')).toMatchObject({ mapped: true });
    expect(r.resolved.find((e) => e.name === 'Bar')).toBeDefined();
    expect(r.stats.events).toBe(0);
  });

  it('accepts lines (sync iterable, async iterable) and CRLF / CR text', async () => {
    const text = ass([style('Default', 'Lines Font')], [dialogue('Default', 'x')]);
    const lines = text.split('\n');
    const viaIter = await preflightScript(lines);
    const viaAsync = await preflightScript((async function* () { for (const l of lines) yield l; })());
    const viaCrlf = await preflightScript(text.replace(/\n/g, '\r\n'));
    const viaCr = await preflightScript(`﻿${text.replace(/\n/g, '\r')}`);
    for (const r of [viaIter, viaAsync, viaCrlf, viaCr]) expect(names(r)).toEqual(['Lines Font']);
  });

  it('warns when a style is defined after the events (streaming assumption)', async () => {
    const text = ['[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text', dialogue('Default', 'x'), '[V4+ Styles]', style('Default', 'Late')].join('\n');
    expect((await preflightScript(text)).warnings.join()).toMatch(/after events/);
  });

  it('reports missing glyphs for faces whose cmap is known', async () => {
    const latin = buildTestFont({ family: 'Latin Only' });
    const r = await preflightScript(ass([style('Default', 'Latin Only')], [dialogue('Default', 'abc Привет\\N{\\b1}ğ')]), { fonts: [latin] });
    const g = r.missingGlyphs['Latin Only'];
    expect(g.count).toBe(7);
    expect(g.sample).toContain(0x41f);
    expect(r.ok).toBe(true);
    expect(r.resolved[0].missingGlyphs).toEqual(g);
    expect((await preflightScript(ass([style('Default', 'Latin Only')], [dialogue('Default', 'Привет')]), { fonts: [latin], glyphs: false })).missingGlyphs).toEqual({});
  });
});
