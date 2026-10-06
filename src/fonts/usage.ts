import { evalStates, type PreparedLine } from '../anim/Prepared';
import type { AssStyle } from '../types/script';

import { cleanName, normalizeName } from './resolver';

export interface FontUse {
  /** First spelling in the script (without `@`). */
  name: string;
  /** Distinct (bold, italic) requests. */
  looks: Map<string, { b: number; i: boolean }>;
  styles: Set<string>;
  lines: Set<number>;
  /** Code points drawn with this font (whitespace and controls left out): what the "does the font have these glyphs" check needs. */
  chars: Set<number>;
}

/** Adds the visible code points of `text` (whitespace, controls and the soft-break marker are not glyphs). */
export const addChars = (into: Set<number>, text: string): void => {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp > 32 && cp !== 127 && !/\s/.test(ch)) into.add(cp);
  }
};

/**
 * Which fonts a script really needs: the font of every non-empty text fragment, evaluated at t = 0 with the same
 * folding the renderer uses (`\fn`, `\b`, `\i`, `\r<style>` included; `\fn` cannot be animated, so t = 0 is exact).
 * Drawings and whitespace-only fragments need no font. Keyed by normalized name.
 */
export const collectUsage = (lines: readonly PreparedLine[], styles: Map<string, AssStyle>): Map<string, FontUse> => {
  const out = new Map<string, FontUse>();
  for (const line of lines) {
    const states = evalStates(line, 0, styles);
    line.event.fragments.forEach((frag, i) => {
      if (frag.drawingScale > 0 || frag.text.trim() === '') return;
      const st = states[i];
      const key = normalizeName(st.fn);
      let use = out.get(key);
      if (!use) out.set(key, (use = { name: cleanName(st.fn), looks: new Map(), styles: new Set(), lines: new Set(), chars: new Set() }));
      use.looks.set(`${st.b}|${st.i}`, { b: st.b, i: st.i });
      use.styles.add(st.style.name);
      use.lines.add(line.event.index);
      addChars(use.chars, frag.text);
    });
  }
  return out;
};
