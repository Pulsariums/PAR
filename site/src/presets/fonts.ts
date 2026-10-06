import { buildTestFont } from '../../../src/fonts/testFont';
import { uuencode } from '../../../src/fonts/uudecode';

import { ev, script, type Preset } from './ass';

/** Family of the generated test font: every ASCII character is a solid bar, so it cannot be mistaken for a real font. */
export const TEST_FAMILY = 'PAR Test Bars';

/** The generated test font (a valid TrueType file built in the browser, ~5 kB). */
export const testFontBytes = (): Uint8Array => buildTestFont({ family: TEST_FAMILY, win: [800, 200] });

const EVENTS = [
  ev(0, 8, `{\\an5\\pos(640,110)\\fn${TEST_FAMILY}\\fs72}Block font line`),
  ev(0, 8, `{\\an5\\pos(640,250)\\fn${TEST_FAMILY}\\fs72\\b1}Bold asked: synthetic`),
  ev(0, 8, '{\\an5\\pos(640,390)\\fnArial\\fs56}Same size in Arial, for comparison'),
  ev(0, 8, '{\\an5\\pos(640,530)\\fnNo Such Font Anywhere\\fs56}Missing font: generic fallback'),
];

/** `[Fonts]` section exactly as Aegisub writes it: `fontname:` then 80-character uuencoded lines. */
const fontsSection = (): string => ['[Fonts]', `fontname: ${TEST_FAMILY}_0.ttf`, ...uuencode(testFontBytes()), ''].join('\n');

export const fontsEmbedded: Preset = { id: 'fontsEmbedded', title: '[Fonts] embedded', ass: `${script(EVENTS, 0, 'Embedded font')}\n${fontsSection()}` };
export const fontsUser: Preset = { id: 'fontsUser', title: 'Fonts: user-supplied', ass: script(EVENTS, 0, 'User-supplied font') };
