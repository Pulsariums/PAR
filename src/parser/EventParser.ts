import type { AssEvent } from '../types/script';

import { splitFields } from './sections';
import { parseText } from './TextParser';
import { parseTime } from './TimeParser';

export const V4P_EVENT_FORMAT = 'layer,start,end,style,name,marginl,marginr,marginv,effect,text'.split(',');
export const V4_EVENT_FORMAT = 'marked,start,end,style,name,marginl,marginr,marginv,effect,text'.split(',');

const int = (v: string | undefined): number => {
  const n = v === undefined ? NaN : parseInt(v.trim(), 10);
  return Number.isFinite(n) ? n : 0;
};

/**
 * One `Dialogue:` value => AssEvent, or an error message. `index` is the position among all
 * Dialogue lines of the file and is the only source of the id (deterministic, never random).
 */
export const parseDialogue = (fields: string[], value: string, index: number): AssEvent | string => {
  const textIdx = fields.indexOf('text');
  const values = splitFields(value, fields.length);
  if (textIdx === -1 || values.length < fields.length) return 'too few fields';
  const get = (k: string): string | undefined => {
    const i = fields.indexOf(k);
    return i === -1 ? undefined : values[i];
  };
  const start = parseTime(get('start') ?? '');
  const end = parseTime(get('end') ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'invalid time';
  const text = values[textIdx].replace(/[\r\t ]+$/, ''); // libass drops trailing CR, TAB and spaces of the Text field
  const { fragments, lineTags, unknownTags } = parseText(text);
  return {
    id: String(index),
    index,
    layer: int(get('layer')),
    start,
    end,
    style: (get('style') ?? 'Default').trim(),
    name: (get('name') ?? get('actor') ?? '').trim(),
    marginL: int(get('marginl')),
    marginR: int(get('marginr')),
    marginV: int(get('marginv')),
    effect: (get('effect') ?? '').trim(),
    text,
    fragments,
    lineTags,
    unknownTags,
  };
};
