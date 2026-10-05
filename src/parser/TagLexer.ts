import { isFuncTag, resolveTagName } from './TagTable';

export interface RawTag {
  /** Known tag name, or null for unknown tags (`raw` is kept). */
  name: string | null;
  /** Argument: the text after the name, or the content inside the parentheses. */
  arg: string;
  /** Raw source including the backslash. */
  raw: string;
}

/** Index of the `)` matching the `(` at `open`; -1 when unclosed. */
export const matchParen = (src: string, open: number): number => {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return i;
  }
  return -1;
};

/**
 * Parenthesis-aware lexer for the CONTENT of an override block (without braces).
 * `\t(0,500,\fs60\1c&HFF0000&)` stays one tag: backslashes inside parentheses do not split.
 * An unclosed parenthesis extends to the end of the block (libass behaviour).
 */
export const lexOverrides = (content: string): RawTag[] => {
  const tags: RawTag[] = [];
  let i = content.indexOf('\\');
  while (i !== -1) {
    const name = resolveTagName(content.slice(i + 1));
    let end: number;
    if (name !== null) {
      let open = i + 1 + name.length;
      while (content[open] === ' ' || content[open] === '\t') open++;
      if (content[open] === '(' && (isFuncTag(name) || name !== 'fn')) {
        const close = matchParen(content, open);
        end = close === -1 ? content.length : close + 1;
        tags.push({ name, arg: content.slice(open + 1, close === -1 ? content.length : close), raw: content.slice(i, end) });
      } else {
        const next = content.indexOf('\\', i + 1);
        end = next === -1 ? content.length : next;
        tags.push({ name, arg: content.slice(i + 1 + name.length, end), raw: content.slice(i, end) });
      }
    } else {
      const next = content.indexOf('\\', i + 1);
      end = next === -1 ? content.length : next;
      const raw = content.slice(i, end);
      if (raw.trim().length > 1) tags.push({ name: null, arg: '', raw });
    }
    i = end >= content.length ? -1 : content.indexOf('\\', end);
  }
  return tags;
};
