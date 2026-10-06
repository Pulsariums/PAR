import { SOFT_BREAK } from '../types/script';

/**
 * libass breaks only at U+0020, the browser also after hyphens, dashes, slashes and `!?|`: a word joiner
 * after those characters (when more text follows in the fragment) removes that break opportunity.
 */
const NO_BREAK_AFTER = /([-\u2010-\u2015/!?|])(?=[^ \n])/g;
/** Display text for a wrap style: `\n` is a break only with `\q2`, a space otherwise. */
export const displayText = (text: string, wrapStyle: number): string =>
  text.split(SOFT_BREAK).join(wrapStyle === 2 ? '\n' : ' ').replace(NO_BREAK_AFTER, '$1\u2060');
