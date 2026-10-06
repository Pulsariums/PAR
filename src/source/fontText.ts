import { KNOWN_SECTIONS } from '../fonts/uudecode';

/** The `[Fonts]` section of a script text (header line included), or null. Inside it every line is data until a known section header. */
export const extractFontSection = (text: string): string | null => {
  const m = /^\[fonts\][ \t]*\r?$/im.exec(text);
  if (!m) return null;
  const out: string[] = [];
  for (const line of text.slice(m.index).split(/\r\n|\r|\n/)) {
    const h = /^\[([^\]]+)\]$/.exec(line.trim());
    if (out.length && h && KNOWN_SECTIONS.has(h[1].trim().toLowerCase())) break;
    out.push(line);
  }
  return out.join('\n');
};
