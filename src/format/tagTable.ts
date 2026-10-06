/** Override tags the model understands. Anything else stays a verbatim piece. */
export type TagKind = 'num' | 'hex' | 'str' | 'par' | 'clip' | 't';

export interface TagDef {
  id: number;
  name: string;
  kind: TagKind;
  /** Fixed argument count for `par`; 0 = variable (count is stored). */
  count: number;
}

const DEFS: Array<[string, TagKind, number?]> = [
  ['fscx', 'num'], ['fscy', 'num'], ['fsp', 'num'], ['fs', 'num'], ['frx', 'num'], ['fry', 'num'], ['frz', 'num'],
  ['fr', 'num'], ['fax', 'num'], ['fay', 'num'], ['xbord', 'num'], ['ybord', 'num'], ['bord', 'num'],
  ['xshad', 'num'], ['yshad', 'num'], ['shad', 'num'], ['blur', 'num'], ['be', 'num'], ['pbo', 'num'], ['fe', 'num'],
  ['b', 'num'], ['i', 'num'], ['u', 'num'], ['s', 'num'], ['p', 'num'], ['an', 'num'], ['a', 'num'], ['q', 'num'],
  ['kf', 'num'], ['ko', 'num'], ['kt', 'num'], ['K', 'num'], ['k', 'num'],
  ['1c', 'hex'], ['2c', 'hex'], ['3c', 'hex'], ['4c', 'hex'], ['c', 'hex'],
  ['alpha', 'hex'], ['1a', 'hex'], ['2a', 'hex'], ['3a', 'hex'], ['4a', 'hex'],
  ['fn', 'str'], ['r', 'str'],
  ['pos', 'par', 2], ['org', 'par', 2], ['fad', 'par', 2], ['fade', 'par', 7], ['move', 'par', 0],
  ['clip', 'clip'], ['iclip', 'clip'], ['t', 't'],
];

/** id 0 and 63 are reserved (end-of-block / verbatim marker). */
export const TAGS: TagDef[] = DEFS.map(([name, kind, count], i) => ({ id: i + 1, name, kind, count: count ?? 0 }));
export const VERB_ID = 63;
export const TAG_BY_ID: Array<TagDef | undefined> = [];
for (const t of TAGS) TAG_BY_ID[t.id] = t;
const BY_LENGTH = [...TAGS].sort((a, b) => b.name.length - a.name.length);

/** Longest tag name that prefixes `body` (the piece text after the backslash). */
export const matchTag = (body: string): TagDef | null => {
  for (const t of BY_LENGTH) if (body.startsWith(t.name)) return t;
  return null;
};

export const TAG_P = TAGS.find((t) => t.name === 'p')!.id;
export const TAG_T = TAGS.find((t) => t.name === 't')!.id;
