import { describe, expect, it } from 'vitest';

import type { FontProbe } from '../src/fonts/probe';
import { cssFamilies, normalizeName, resolveFont, wantedWeight, type PoolFace, type ResolveEnv } from '../src/fonts/resolver';

const face = (o: Partial<PoolFace> & { family: string }): PoolFace => ({
  id: o.id ?? `${o.family}-${o.weight ?? 400}-${o.italic ? 'i' : 'n'}`, families: [o.family.toLowerCase()], fullNames: [], weight: 400, italic: false,
  boldFlag: (o.weight ?? 400) >= 600, ratio: 1, source: 'user', ...o,
});
const probeOf = (installed: string[] | null): FontProbe => ({
  installed: (n) => (installed === null ? null : installed.map((s) => s.toLowerCase()).includes(n.toLowerCase())),
  ratio: () => null,
  clear: () => undefined,
});
const env = (faces: PoolFace[], fontMap: Record<string, string> = {}, installed: string[] | null = []): ResolveEnv => ({ faces, fontMap, probe: probeOf(installed) });

describe('font name resolution', () => {
  it('normalizes: leading @ stripped, trimmed, case-insensitive', () => {
    expect(normalizeName('  @Arial ')).toBe('arial');
    const e = env([face({ family: 'Foo Bar' })]);
    for (const n of ['foo bar', 'FOO BAR', '@Foo Bar', ' Foo Bar ']) expect(resolveFont(e, n, 0, false)).toMatchObject({ status: 'user', family: '"Foo Bar", sans-serif' });
  });

  it('picks the real bold / italic face when loaded, with no synthetic flag', () => {
    const e = env([face({ family: 'Fam' }), face({ family: 'Fam', weight: 700 }), face({ family: 'Fam', italic: true }), face({ family: 'Fam', weight: 700, italic: true })]);
    expect(resolveFont(e, 'Fam', -1, false)).toMatchObject({ weight: 700, italic: false, syntheticBold: false });
    expect(resolveFont(e, 'Fam', 0, true)).toMatchObject({ weight: 400, italic: true, syntheticItalic: false });
    expect(resolveFont(e, 'Fam', 1, true)).toMatchObject({ weight: 700, italic: true, syntheticBold: false, syntheticItalic: false });
  });

  it('flags synthetic bold / italic when only the regular face exists (libass rule: weight > face + 150)', () => {
    const e = env([face({ family: 'Solo' })]);
    expect(resolveFont(e, 'Solo', 1, false)).toMatchObject({ syntheticBold: true, weight: 700 });
    expect(resolveFont(e, 'Solo', 0, true)).toMatchObject({ syntheticItalic: true, italic: true });
    expect(resolveFont(e, 'Solo', 0, false)).toMatchObject({ syntheticBold: false, syntheticItalic: false, weight: 400 });
    // a semibold face does not need emboldening for \b1 (700 <= 600 + 150)
    expect(resolveFont(env([face({ family: 'Semi', weight: 600 })]), 'Semi', 1, false).syntheticBold).toBe(false);
  });

  it('maps explicit weights to the nearest face', () => {
    const e = env([face({ family: 'W', weight: 300 }), face({ family: 'W', weight: 900 })]);
    expect(resolveFont(e, 'W', 400, false).weight).toBe(300);
    expect(resolveFont(e, 'W', 800, false).weight).toBe(900);
    expect(wantedWeight(1)).toBe(700);
    expect(wantedWeight(0)).toBe(400);
    expect(wantedWeight(349)).toBe(300);
  });

  it('a full-name match names one exact face and is not un-bolded by \\b0', () => {
    const bold = face({ family: 'Big Family', weight: 700, fullNames: ['big family bold'] });
    const e = env([face({ family: 'Big Family' }), bold]);
    expect(resolveFont(e, 'Big Family Bold', 0, false)).toMatchObject({ weight: 700, syntheticBold: false, status: 'user' });
  });

  it('legacy family aliases (nameID 1, e.g. "Open Sans Semibold") reach the face', () => {
    const f = face({ family: 'Open Sans', weight: 600, families: ['open sans', 'open sans semibold'] });
    expect(resolveFont(env([f]), 'Open Sans Semibold', 0, false)).toMatchObject({ weight: 600, family: '"Open Sans", sans-serif' });
  });

  it('order: loaded (user > embedded) => fontMap => local face => system => missing', () => {
    const user = face({ family: 'Same', id: 'u', source: 'user' });
    const emb = face({ family: 'Same', id: 'e', source: 'embedded' });
    const loc = face({ family: 'Localo', id: 'l', source: 'local' });
    expect(resolveFont(env([emb, user]), 'Same', 0, false)).toMatchObject({ faceId: 'u', status: 'user' });
    expect(resolveFont(env([emb]), 'Same', 0, false).status).toBe('embedded');
    // fontMap beats a local face, a loaded face beats fontMap
    expect(resolveFont(env([loc], { localo: '"Mapped Away", serif' }, ['Mapped Away']), 'Localo', 0, false)).toMatchObject({ status: 'system', mapped: true, family: '"Mapped Away", serif' });
    expect(resolveFont(env([user], { same: '"X"' }), 'Same', 0, false)).toMatchObject({ status: 'user', mapped: false });
    expect(resolveFont(env([loc]), 'Localo', 0, false).status).toBe('local');
    expect(resolveFont(env([], {}, ['Arial']), 'arial', 0, false)).toMatchObject({ status: 'system', verified: true });
    expect(resolveFont(env([], {}, ['Arial']), 'Nope', 0, false)).toMatchObject({ status: 'missing', verified: true, family: '"Nope", sans-serif' });
  });

  it('fontMap may point at a loaded family, and uses its real face', () => {
    const f = face({ family: 'Real Family', weight: 700 });
    expect(resolveFont(env([f], { 'my script font': '"Real Family", serif' }), 'My Script Font', 1, false)).toMatchObject({ status: 'user', mapped: true, weight: 700 });
  });

  it('without a canvas, system/missing cannot be told apart: reported as unverified system', () => {
    expect(resolveFont(env([], {}, null), 'Whatever', 0, false)).toMatchObject({ status: 'system', verified: false, ratio: 0.9, ratioSource: 'default' });
  });

  it('uses the face ratio from the font file', () => {
    expect(resolveFont(env([face({ family: 'R', ratio: 0.8 })]), 'R', 0, false)).toMatchObject({ ratio: 0.8, ratioSource: 'font-file' });
    expect(resolveFont(env([face({ family: 'R', ratio: null })]), 'R', 0, false)).toMatchObject({ ratio: 0.9, ratioSource: 'default' });
  });

  it('parses CSS family lists', () => {
    expect(cssFamilies(`"A B", 'C', serif`)).toEqual(['A B', 'C', 'serif']);
  });
});
