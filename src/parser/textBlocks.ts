import { SOFT_BREAK } from '../types/script';

/**
 * Index of the next override-block opener `{` at or after `from`, or -1. A `{` right after a backslash
 * is the escape `\{` (a literal brace, libass `ass_get_next_char`), not a block start.
 */
export const findBlockOpen = (text: string, from: number): number => {
  let i = text.indexOf('{', from);
  while (i > 0 && text.charCodeAt(i - 1) === 92) i = text.indexOf('{', i + 1);
  return i;
};

const NBSP = '\u00a0';

/**
 * Text escapes: `\N` newline, `\n` soft break, `\h` no-break space, `\{` `\}` literal braces, TAB becomes a space
 * (libass). Other backslashes stay literal.
 */
export const unescapeText = (s: string): string =>
  s.replace(/\\([Nnh{}])|\t/g, (_m, c: string | undefined) => (c === undefined ? ' ' : c === 'N' ? '\n' : c === 'n' ? SOFT_BREAK : c === 'h' ? NBSP : c));
