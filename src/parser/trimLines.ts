import type { Fragment } from '../types/script';

/**
 * libass `trim_whitespace`: spaces (U+0020, TAB already became one) at the start and end of every line,
 * lines being separated by `\N` ("\n" in fragment text), are not drawn and take no width. A no-break space
 * (`\h`) is kept. Works across fragments (`{\b1} Hello`) and leaves the fragments themselves in place.
 */
export const trimLines = (fragments: Fragment[]): void => {
  const pass = (list: Fragment[], reversed: boolean): void => {
    let edge = true;
    for (const f of list) {
      if (f.drawingScale > 0) {
        edge = false;
        continue;
      }
      let out = '';
      const chars = reversed ? [...f.text].reverse() : [...f.text];
      for (const ch of chars) {
        if (ch === ' ' && edge) continue;
        edge = ch === '\n';
        out += ch;
      }
      f.text = reversed ? [...out].reverse().join('') : out;
    }
  };
  pass(fragments, false);
  pass([...fragments].reverse(), true);
};
