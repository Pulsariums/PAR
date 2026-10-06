import { parseScript } from '../parser/ScriptParser';
import { extractFontSection } from './fontText';
import type { SubtitleSource } from './types';
import { filterWindow } from './window';

/** A script given as text, parsed once (what `PAR.create({ subtitle: text })` has always done), served through the window API. */
export const fromAssText = (text: string): SubtitleSource => {
  const parsed = parseScript(text);
  const bytes = text.length;
  return {
    kind: 'text',
    script: { info: parsed.info, styles: parsed.styles, warnings: parsed.warnings },
    duration: parsed.events.reduce((m, e) => Math.max(m, e.end), 0),
    eventCount: parsed.events.length,
    readWindow: async (t0, t1) => filterWindow(parsed.events, t0, t1),
    fontSection: async () => extractFontSection(text),
    stats: () => ({ bytesRead: bytes, decodeMs: 0 }),
  };
};
