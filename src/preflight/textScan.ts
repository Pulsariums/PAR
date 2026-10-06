import { lexOverrides } from '../parser/TagLexer';
import { parseNum } from '../parser/TagValues';
import { unescapeText } from '../parser/TextParser';
import { addChars } from '../fonts/usage';
import { cleanName, normalizeName } from '../fonts/resolver';
import type { AssStyle } from '../types/script';

import type { UsedFont } from './types';

/** Blocks without any of these tags cannot change the font state: skip lexing them (a speed-up only, the lexer decides the rest). */
const RELEVANT = /\\(?:fn|b|i|r|p)/;

interface State {
  style: AssStyle;
  fn: string;
  b: number;
  i: boolean;
}

const fromStyle = (style: AssStyle): State => ({ style, fn: style.fontName, b: style.bold, i: style.italic });

/**
 * Records the fonts the text of one event draws. Same rules as `collectUsage` over parsed fragments (single source of
 * truth is the lexer): `\fn` / `\b` / `\i` / `\r<style>` fold in source order, `\t(...)` cannot change them, drawings
 * (`\p1`) and whitespace-only fragments need no font. `uses` is updated in place; `touched` collects the fonts of this event.
 */
export const scanEventText = (
  text: string,
  base: AssStyle,
  styles: ReadonlyMap<string, AssStyle>,
  uses: Map<string, UsedFont>,
  touched: Set<UsedFont>,
  glyphs: boolean,
): void => {
  let st = fromStyle(base);
  let drawing = 0;
  let pos = 0;
  const emit = (seg: string): void => {
    if (drawing > 0 || seg === '') return;
    const shown = seg.indexOf('\\') === -1 ? seg : unescapeText(seg);
    if (shown.trim() === '') return;
    const key = normalizeName(st.fn);
    let use = uses.get(key);
    if (!use) uses.set(key, (use = { name: cleanName(st.fn), looks: new Map(), styles: new Set(), lineCount: 0, sample: [], chars: new Set() }));
    use.looks.set(`${st.b}|${st.i}`, { b: st.b, i: st.i });
    use.styles.add(st.style.name);
    touched.add(use);
    if (glyphs) addChars(use.chars, shown);
  };
  while (pos < text.length) {
    const open = text.indexOf('{', pos);
    const close = open === -1 ? -1 : text.indexOf('}', open);
    if (close === -1) { emit(text.slice(pos)); break; }
    emit(text.slice(pos, open));
    pos = close + 1;
    const block = text.slice(open + 1, close);
    if (!RELEVANT.test(block)) continue;
    for (const tag of lexOverrides(block)) {
      switch (tag.name) {
        case 'r': { const n = tag.arg.trim(); st = fromStyle(n ? styles.get(n) ?? base : base); break; }
        case 'fn': st = { ...st, fn: tag.arg.trim() || st.style.fontName }; break;
        case 'b': st = { ...st, b: parseNum(tag.arg) ?? st.style.bold }; break;
        case 'i': { const v = parseNum(tag.arg); st = { ...st, i: v === null ? st.style.italic : v !== 0 }; break; }
        case 'p': drawing = Math.max(0, Math.floor(parseNum(tag.arg) ?? 0)); break;
        default:
      }
    }
  }
};
