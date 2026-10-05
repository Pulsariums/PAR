/** ASS override tag names. Resolution uses the longest-prefix rule (`\fscx` before `\fs`). */
export const FUNC_TAGS = ['t', 'pos', 'move', 'org', 'fade', 'fad', 'clip', 'iclip'] as const;

export const NUM_TAGS = [
  'fscx', 'fscy', 'fsp', 'fs', 'frx', 'fry', 'frz', 'fr', 'fax', 'fay', 'xbord', 'ybord', 'bord',
  'xshad', 'yshad', 'shad', 'blur', 'be', 'pbo', 'fe', 'b', 'i', 'u', 's', 'p',
] as const;

export const COLOR_TAGS = ['1c', '2c', '3c', '4c', 'c'] as const;
export const ALPHA_TAGS = ['alpha', '1a', '2a', '3a', '4a'] as const;
export const KARA_TAGS = ['kf', 'ko', 'kt', 'K', 'k'] as const;
export const OTHER_TAGS = ['fn', 'an', 'a', 'q', 'r'] as const;

const ALL: readonly string[] = [
  ...FUNC_TAGS, ...NUM_TAGS, ...COLOR_TAGS, ...ALPHA_TAGS, ...KARA_TAGS, ...OTHER_TAGS,
];
const BY_LENGTH = [...ALL].sort((a, b) => b.length - a.length);
const FUNC = new Set<string>(FUNC_TAGS);

/** Known tag name at the start of `body` (text after the backslash), or null. */
export const resolveTagName = (body: string): string | null => {
  for (const name of BY_LENGTH) {
    if (!body.startsWith(name)) continue;
    // A function tag without '(' is invalid; it must not decay into a shorter tag (`\clip` -> `\c`).
    if (FUNC.has(name) && body.slice(name.length).trimStart()[0] !== '(') return null;
    return name;
  }
  return null;
};

export const isFuncTag = (name: string): boolean => FUNC.has(name);
