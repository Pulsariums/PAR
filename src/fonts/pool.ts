import type { RegisteredFace } from './registry';
import { normalizeName, type PoolFace } from './resolver';
import type { FontInput, FontSourceKind, FontSpec, LoadedFont, AddFontOptions, AddFontsEntry } from './types';

/** A face held by one FontManager, with every reason it is held (a face can be both user-supplied and embedded). */
export interface Loaded {
  face: RegisteredFace;
  sources: Set<FontSourceKind>;
  label: string;
}

const RANK: FontSourceKind[] = ['user', 'embedded', 'provider', 'local'];
export const effective = (l: Loaded): FontSourceKind => RANK.find((s) => l.sources.has(s))!;

/** `fontMap` with normalized (case-insensitive) keys. */
export const lowerKeys = (m: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(m).map(([k, v]) => [normalizeName(k), v]));

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export const toPoolFace = (l: Loaded): PoolFace => {
  const { face } = l;
  const { info } = face.parsed;
  return {
    id: face.key, family: face.family, families: info.families.map((s) => s.toLowerCase()), fullNames: info.fullNames.map((s) => s.toLowerCase()),
    weight: face.weight, italic: face.italic, boldFlag: info.boldFlag, ratio: face.ratio, source: effective(l), coverage: info.coverage,
  };
};

export const toLoadedFont = (key: string, l: Loaded): LoadedFont => ({
  id: key, family: l.face.family, aliases: l.face.parsed.info.families.map((s) => s.toLowerCase()), weight: l.face.weight,
  italic: l.face.italic, source: effective(l), label: l.label, state: l.face.state, error: l.face.error,
});

/** `addFonts` core: each spec is loaded independently, a failing file only marks its own entry. */
export const addMany = (add: (i: FontInput, o: AddFontOptions) => Promise<LoadedFont[]>, specs: Iterable<FontSpec>): Promise<AddFontsEntry[]> =>
  Promise.all([...specs].map(async (spec) => {
    const { source, family } = spec && typeof spec === 'object' && 'source' in spec ? spec : { source: spec as FontInput, family: undefined };
    const name = typeof source === 'string' || source instanceof URL ? String(source) : (source as { name?: string }).name ?? '';
    try { return { name, fonts: await add(source, { family }) }; } catch (e) { return { name, fonts: [], error: errMsg(e) }; }
  }));
