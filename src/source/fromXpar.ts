import { fromUtf8 } from '../format/bytes';
import { openPar, openXpar } from '../format/open';
import type { XparFile } from '../format/reader';
import { toSource, type XparSource } from '../format/source';
import { KNOWN_SECTIONS } from '../fonts/uudecode';
import { filterWindow, Meter } from './window';
import type { SubtitleSource } from './types';

/** The `[Fonts]` lines among the file's verbatim (non-event) lines. */
const fontSection = (f: XparFile): string | null => {
  const out: string[] = [];
  let inFonts = false;
  for (const l of f.meta.misc) {
    let s: string;
    try { s = fromUtf8(l.bytes); } catch { continue; }
    const h = /^\[([^\]]+)\]$/.exec(s.trim());
    if (h && h[1].trim().toLowerCase() === 'fonts') { inFonts = true; out.push(s); continue; }
    if (inFonts && h && KNOWN_SECTIONS.has(h[1].trim().toLowerCase())) break;
    if (inFonts) out.push(s);
  }
  return out.length ? out.join('\n') : null;
};

const wrap = (file: XparFile, kind: string, meter: Meter, indexMs: number): SubtitleSource => ({
  kind,
  script: { info: file.script.info, styles: file.script.styles, warnings: file.script.warnings },
  duration: file.duration,
  eventCount: file.meta.dialogues,
  readWindow: (t0, t1) => meter.time(async () => filterWindow(await file.readWindow(t0, t1), t0, t1)),
  fontSection: async () => fontSection(file),
  stats: () => ({ bytesRead: meter.bytesRead, decodeMs: meter.decodeMs, indexMs }),
});

const open = async (source: XparSource, lossy: boolean): Promise<SubtitleSource> => {
  const meter = new Meter();
  const src = toSource(source);
  const counted = { size: () => src.size(), read: async (o: number, l: number) => { const b = await src.read(o, l); meter.bytesRead += b.length; return b; } };
  const t = performance.now();
  const file = lossy ? (await openPar(counted)).file : await openXpar(counted);
  return wrap(file, file.lossy ? 'par' : 'xpar', meter, performance.now() - t);
};

/** A lossless `.xpar` (Blob/File, bytes, URL with Range support, or a ByteSource). Only the chunks of the asked window are read and decoded. */
export const fromXpar = (source: XparSource): Promise<SubtitleSource> => open(source, false);

/** A lossy `.par` (a lossless file is refused). Plays the baked script of its target fps. */
export const fromPar = (source: XparSource): Promise<SubtitleSource> => open(source, true);
