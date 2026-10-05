export interface SourceLine {
  text: string;
  /** 1-based line number in the file. */
  lineNo: number;
}

export interface Section {
  /** Lower-cased section name without brackets, e.g. `"v4+ styles"`. */
  name: string;
  lines: SourceLine[];
}

/** Splits a script into sections. Handles BOM, CRLF/CR/LF, blank lines and `;` comments. */
export const splitSections = (text: string): Section[] => {
  const sections: Section[] = [];
  let current: Section | null = null;
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t === '' || t.startsWith(';')) return;
    const header = /^\[(.+)\]$/.exec(t);
    if (header) {
      current = { name: header[1].trim().toLowerCase(), lines: [] };
      sections.push(current);
      return;
    }
    if (current) current.lines.push({ text: line.replace(/^\s+/, ''), lineNo: i + 1 });
  });
  return sections;
};

/** `Key: value` => [key, value] (split at the first colon); null when there is no colon. */
export const splitKeyValue = (line: string): [string, string] | null => {
  const i = line.indexOf(':');
  return i === -1 ? null : [line.slice(0, i).trim(), line.slice(i + 1).replace(/^\s+/, '')];
};

/** `Format:` field list, trimmed and lower-cased. */
export const parseFormat = (value: string): string[] => value.split(',').map((f) => f.trim().toLowerCase());

/** Splits a record into `count` fields; the last field keeps any remaining commas (event Text). */
export const splitFields = (value: string, count: number): string[] => {
  const out: string[] = [];
  let rest = value;
  for (let i = 0; i < count - 1; i++) {
    const c = rest.indexOf(',');
    if (c === -1) break;
    out.push(rest.slice(0, c));
    rest = rest.slice(c + 1);
  }
  out.push(rest);
  return out;
};
