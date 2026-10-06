/** SSA/ASS "uuencode": 4 chars (value + 33 each, 6 bits) => 3 bytes; Aegisub/libass write 80-char lines (60 bytes). */

/** Decodes one line. A trailing partial group of 2 or 3 chars yields 1 or 2 bytes; characters outside 33..96 are skipped. */
export const uudecodeLine = (line: string): number[] => {
  const out: number[] = [];
  let acc = 0;
  let n = 0;
  const flush = (): void => {
    if (n < 2) return;
    const pad = 4 - n;
    const v = acc << (6 * pad);
    out.push((v >> 16) & 255);
    if (n >= 3) out.push((v >> 8) & 255);
    if (n === 4) out.push(v & 255);
  };
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i) - 33;
    if (c < 0 || c > 63) continue;
    acc = (acc << 6) | c;
    if (++n === 4) { flush(); acc = 0; n = 0; }
  }
  flush();
  return out;
};

/** Decodes the data lines of one font (each line independently, like libass). */
export const uudecode = (lines: readonly string[]): Uint8Array => {
  const parts = lines.map(uudecodeLine);
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return out;
};

/** Inverse of `uudecode` (Aegisub flavour: 60 bytes per line, partial last group). For tests and tooling. */
export const uuencode = (data: Uint8Array): string[] => {
  const lines: string[] = [];
  for (let o = 0; o < data.length; o += 60) {
    let s = '';
    for (let i = o; i < Math.min(o + 60, data.length); i += 3) {
      const rest = Math.min(3, data.length - i);
      const v = (data[i] << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
      const chars = [(v >> 18) & 63, (v >> 12) & 63, (v >> 6) & 63, v & 63].slice(0, rest + 1);
      s += chars.map((c) => String.fromCharCode(c + 33)).join('');
    }
    lines.push(s);
  }
  return lines;
};

export interface EmbeddedFile {
  /** The `fontname:` value, e.g. `Arial_0.ttf`. */
  name: string;
  data: Uint8Array;
}

export const KNOWN_SECTIONS = new Set(['script info', 'v4+ styles', 'v4 styles', 'v4 styles+', 'events', 'fonts', 'graphics', 'aegisub project garbage', 'aegisub extradata']);
const FONT_LINE = /^fontname\s*:\s*(.+)$/i;

/**
 * Embedded fonts of a script's `[Fonts]` section. The section is scanned on the raw text, not through the section
 * splitter: data lines may begin with `;` or look like `[ab]`, which a splitter would drop or take for headers.
 * Inside an open font every non-empty line is data, except `fontname:` and the known section headers.
 * `[Graphics]` (and every other section) is ignored.
 */
export const extractEmbeddedFiles = (text: string): EmbeddedFile[] => {
  const files: EmbeddedFile[] = [];
  let inFonts = false;
  let name: string | null = null;
  let rows: string[] = [];
  const close = (): void => {
    if (name !== null && rows.length > 0) files.push({ name, data: uudecode(rows) });
    name = null;
    rows = [];
  };
  for (const raw of text.replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header && KNOWN_SECTIONS.has(header[1].trim().toLowerCase())) {
      close();
      inFonts = header[1].trim().toLowerCase() === 'fonts';
      continue;
    }
    if (!inFonts || line === '') continue;
    const m = FONT_LINE.exec(line);
    if (m) { close(); name = m[1].trim(); } else if (name !== null) rows.push(line);
  }
  close();
  return files;
};
