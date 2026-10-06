import { hasCp, type Coverage } from '../fonts/coverage';

export interface ScriptDef {
  id: string;
  /** English label (UIs translate by id). */
  label: string;
  /** Representative characters that a font claiming the script must have. */
  sample: string;
}

const range = (a: number, b: number): string => String.fromCodePoint(...Array.from({ length: b - a + 1 }, (_, i) => a + i));

/** Representative samples, not Unicode block definitions: a badge means "all of these are present". */
export const SCRIPTS: readonly ScriptDef[] = [
  { id: 'latin', label: 'Latin', sample: range(0x41, 0x5a) + range(0x61, 0x7a) },
  // Turkish ğüşıöç + dotted İ, Azerbaijani ə, Polish, Czech / Slovak, Romanian, Hungarian
  { id: 'latin-ext', label: 'Latin Extended', sample: 'ğĞüÜşŞıİöÖçÇəƏąćęłńśźżĄĆĘŁŃŚŹŻěščřžĚŠČŘŽăâîșțĂÂÎȘȚőűŐŰ' },
  { id: 'cyrillic', label: 'Cyrillic', sample: range(0x410, 0x44f) + 'Ёё' },
  { id: 'greek', label: 'Greek', sample: range(0x391, 0x3a1) + range(0x3a3, 0x3a9) + range(0x3b1, 0x3c9) },
  { id: 'hiragana', label: 'Hiragana', sample: range(0x3041, 0x3093) },
  { id: 'katakana', label: 'Katakana', sample: range(0x30a1, 0x30f3) },
  { id: 'kanji', label: 'Kanji (sample)', sample: '日一国会人年大十二本中長出三同時政事自行社見月分議後前民生連五発間対上部東者党地合市業内相方四定今回新場金員九入選立開手米力学問高現用件当調語' },
  { id: 'symbols', label: 'Symbols', sample: '♪♫♥★☆→←↑↓…—–“”‘’•€£¥©®™°±×÷' },
];

/** Share of each script's sample the font has, 0..1. */
export const scriptRatios = (cov: Coverage | null): Record<string, number> =>
  Object.fromEntries(SCRIPTS.map((s) => {
    const cps = [...s.sample].map((c) => c.codePointAt(0)!);
    return [s.id, cov ? cps.filter((cp) => hasCp(cov, cp)).length / cps.length : 0];
  }));

/** Script ids a font covers completely (every sample character present). */
export const scriptBadges = (cov: Coverage | null): string[] =>
  Object.entries(scriptRatios(cov)).filter(([, r]) => r === 1).map(([id]) => id);
