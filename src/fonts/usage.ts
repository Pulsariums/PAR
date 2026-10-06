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

/** Fonts the STYLES name (no text scan): the starting set of a windowed script before any window has arrived. */
export const styleUsage = (styles: Map<string, AssStyle>): Map<string, FontUse> => {
  const out = new Map<string, FontUse>();
  for (const s of styles.values()) {
    const key = normalizeName(s.fontName);
    const use = out.get(key) ?? { name: cleanName(s.fontName), looks: new Map(), styles: new Set(), lines: new Set(), chars: new Set() };
    use.looks.set(`${s.bold}|${s.italic}`, { b: s.bold, i: s.italic });
    use.styles.add(s.name);
    out.set(key, use);
  }
  return out;
};

/**
 * Windowed scripts: folds the fonts of a newly loaded window into the known set and forgets the event indexes of evicted
 * events (so per-font line sets stay as small as the window). Returns whether anything the renderer cares about is new.
 */
export const mergeUsage = (into: Map<string, FontUse>, add: Map<string, FontUse>, removed: readonly number[] = []): boolean => {
  let changed = false;
  for (const u of into.values()) for (const i of removed) u.lines.delete(i);
  for (const [k, u] of add) {
    const t = into.get(k);
    if (!t) { into.set(k, u); changed = true; continue; }
    for (const [lk, l] of u.looks) if (!t.looks.has(lk)) { t.looks.set(lk, l); changed = true; }
    for (const s of u.styles) t.styles.add(s);
    for (const c of u.chars) if (!t.chars.has(c)) { t.chars.add(c); changed = true; }
    u.lines.forEach((i) => t.lines.add(i));
  }
  return changed;
};
