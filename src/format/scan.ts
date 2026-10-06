import { parseFormat, splitFields, splitKeyValue } from '../parser/sections';
import { V4P_EVENT_FORMAT } from '../parser/EventParser';
import { parseTime } from '../parser/TimeParser';

/** What a physical line of an ASS file is, following exactly the rules of `parseScript` (sections, Format, ordinals). */
export type LineClass =
  | { t: 'misc' }
  | { t: 'event'; comment: boolean; ordinal: number; fmt: number; startMs: number; endMs: number; value: string };

export interface FormatInfo {
  names: string[];
  n: number;
  iStart: number;
  iEnd: number;
  hasText: boolean;
  /** Exactly the standard V4+ column order: eligible for the columnar codec. */
  standard: boolean;
}

const STD = V4P_EVENT_FORMAT.join(',');
const HEADER = /^\[(.+)\]$/;
const ms = (sec: number): number => Math.round(sec * 1000);

export const formatInfo = (names: string[]): FormatInfo => ({
  names,
  n: names.length,
  iStart: names.indexOf('start'),
  iEnd: names.indexOf('end'),
  hasText: names.includes('text'),
  standard: names.join(',') === STD,
});

/**
 * Stateful line classifier. `ordinal` counts every `Dialogue` line of every `[Events]` section, including
 * malformed ones, exactly like `parseScript`, so ids derived from it are identical to a full parse.
 */
export class LineScanner {
  section = '';
  readonly formats: FormatInfo[] = [];
  private readonly formatIds = new Map<string, number>();
  cur = -1;
  ordinal = 0;

  private register(value: string): number {
    const names = parseFormat(value);
    const key = names.join(',');
    let id = this.formatIds.get(key);
    if (id === undefined) {
      id = this.formats.length;
      this.formats.push(formatInfo(names));
      this.formatIds.set(key, id);
    }
    return id;
  }

  scan(line: string): LineClass {
    let dialogue = line.startsWith('Dialogue:');
    let comment = !dialogue && line.startsWith('Comment:');
    if (this.section === 'events' && (dialogue || comment)) return this.event(line, dialogue, 8 + (comment ? 0 : 1));
    const t = line.trim();
    if (t === '' || t[0] === ';') return MISC;
    const h = HEADER.exec(t);
    if (h) {
      this.section = h[1].trim().toLowerCase();
      this.cur = -1;
      return MISC;
    }
    if (this.section !== 'events') return MISC;
    const kv = splitKeyValue(line.replace(/^\s+/, ''));
    if (!kv) return MISC;
    const key = kv[0].toLowerCase();
    if (key === 'format') this.cur = this.register(kv[1]);
    dialogue = key === 'dialogue';
    comment = key === 'comment';
    return dialogue || comment ? this.eventFrom(kv[1], dialogue) : MISC;
  }

  private event(line: string, dialogue: boolean, prefixLen: number): LineClass {
    return this.eventFrom(line.slice(prefixLen).replace(/^\s+/, ''), dialogue);
  }

  private eventFrom(value: string, dialogue: boolean): LineClass {
    const ordinal = dialogue ? this.ordinal++ : -1;
    const f = this.cur === -1 ? DEFAULT : this.formats[this.cur];
    if (!f.hasText) return MISC;
    const values = splitFields(value, f.n);
    if (values.length < f.n) return MISC;
    const start = parseTime(values[f.iStart] ?? '');
    const end = parseTime(values[f.iEnd] ?? '');
    if (!Number.isFinite(start) || !Number.isFinite(end)) return MISC;
    return { t: 'event', comment: !dialogue, ordinal, fmt: this.cur, startMs: ms(start), endMs: ms(end), value };
  }
}

const MISC: LineClass = { t: 'misc' };
const DEFAULT = formatInfo(V4P_EVENT_FORMAT);
