import { countIn } from '../fonts/coverage';

/** Main Unicode blocks (start, end, name), sorted: enough to label a character in a glyph grid. */
export const BLOCKS: ReadonlyArray<readonly [number, number, string]> = [
  [0x0000, 0x007f, 'Basic Latin'], [0x0080, 0x00ff, 'Latin-1 Supplement'], [0x0100, 0x017f, 'Latin Extended-A'], [0x0180, 0x024f, 'Latin Extended-B'],
  [0x0250, 0x02af, 'IPA Extensions'], [0x02b0, 0x02ff, 'Spacing Modifier Letters'], [0x0300, 0x036f, 'Combining Diacritical Marks'], [0x0370, 0x03ff, 'Greek and Coptic'],
  [0x0400, 0x04ff, 'Cyrillic'], [0x0500, 0x052f, 'Cyrillic Supplement'], [0x0530, 0x058f, 'Armenian'], [0x0590, 0x05ff, 'Hebrew'], [0x0600, 0x06ff, 'Arabic'],
  [0x0e00, 0x0e7f, 'Thai'], [0x10a0, 0x10ff, 'Georgian'], [0x1100, 0x11ff, 'Hangul Jamo'], [0x1e00, 0x1eff, 'Latin Extended Additional'], [0x1f00, 0x1fff, 'Greek Extended'],
  [0x2000, 0x206f, 'General Punctuation'], [0x2070, 0x209f, 'Superscripts and Subscripts'], [0x20a0, 0x20cf, 'Currency Symbols'], [0x2100, 0x214f, 'Letterlike Symbols'],
  [0x2150, 0x218f, 'Number Forms'], [0x2190, 0x21ff, 'Arrows'], [0x2200, 0x22ff, 'Mathematical Operators'], [0x2300, 0x23ff, 'Miscellaneous Technical'],
  [0x2460, 0x24ff, 'Enclosed Alphanumerics'], [0x2500, 0x257f, 'Box Drawing'], [0x2580, 0x259f, 'Block Elements'], [0x25a0, 0x25ff, 'Geometric Shapes'],
  [0x2600, 0x26ff, 'Miscellaneous Symbols'], [0x2700, 0x27bf, 'Dingbats'], [0x2e80, 0x2fdf, 'CJK Radicals'], [0x3000, 0x303f, 'CJK Symbols and Punctuation'],
  [0x3040, 0x309f, 'Hiragana'], [0x30a0, 0x30ff, 'Katakana'], [0x3100, 0x312f, 'Bopomofo'], [0x3130, 0x318f, 'Hangul Compatibility Jamo'], [0x31f0, 0x31ff, 'Katakana Phonetic Extensions'],
  [0x3200, 0x32ff, 'Enclosed CJK Letters and Months'], [0x3400, 0x4dbf, 'CJK Unified Ideographs Extension A'], [0x4e00, 0x9fff, 'CJK Unified Ideographs'],
  [0xac00, 0xd7af, 'Hangul Syllables'], [0xe000, 0xf8ff, 'Private Use Area'], [0xf900, 0xfaff, 'CJK Compatibility Ideographs'], [0xfb00, 0xfb4f, 'Alphabetic Presentation Forms'],
  [0xfe30, 0xfe4f, 'CJK Compatibility Forms'], [0xff00, 0xffef, 'Halfwidth and Fullwidth Forms'], [0x1f300, 0x1f5ff, 'Miscellaneous Symbols and Pictographs'],
  [0x1f600, 0x1f64f, 'Emoticons'], [0x1f680, 0x1f6ff, 'Transport and Map Symbols'], [0x1f900, 0x1f9ff, 'Supplemental Symbols and Pictographs'], [0x20000, 0x2a6df, 'CJK Unified Ideographs Extension B'],
];

/** Block name of a code point, or '' when it is not in the table. */
export const blockName = (cp: number): string => BLOCKS.find(([a, b]) => cp >= a && cp <= b)?.[2] ?? '';

/** `U+0041` style label (at least four hex digits). */
export const codeLabel = (cp: number): string => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

export interface BlockStat {
  name: string;
  start: number;
  /** Mapped code points of the font inside the block. */
  count: number;
  /** Index (in the font's ascending list of mapped code points) of the block's first mapped code point. */
  firstIndex: number;
}

/** The known blocks the font has glyphs in, with where each starts in the font's code point list (for a pager). */
export const blockStats = (cov: Uint32Array): BlockStat[] => {
  const out: BlockStat[] = [];
  for (const [a, b, name] of BLOCKS) {
    const count = countIn(cov, a, b);
    if (count) out.push({ name, start: a, count, firstIndex: a === 0 ? 0 : countIn(cov, 0, a - 1) });
  }
  return out;
};
