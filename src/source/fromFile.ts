import { AssIndex, indexAss, type AssIndexOptions } from '../format/assIndex';
import { filterWindow, Meter } from './window';
import type { SubtitleSource } from './types';

/** Index options (`rangeBytes`...), `onProgress(bytesRead, total)` and `signal` (cancel => rejects with an `ABORTED` XparError). */
export type FileSourceOptions = AssIndexOptions;

/** Counts what `Blob.slice().arrayBuffer()` reads after indexing. */
const counting = (blob: Blob, m: Meter): Blob =>
  ({ size: blob.size, slice: (a?: number, b?: number) => ({ arrayBuffer: async () => { const r = await blob.slice(a, b).arrayBuffer(); m.bytesRead += r.byteLength; return r; } }) }) as unknown as Blob;

/**
 * A (possibly huge) .ass / .ssa file. The file is streamed ONCE to build a small time index (header, styles, byte runs);
 * windows are then read with `Blob.slice`, so the text is never held as one string.
 */
export const fromAssFile = async (file: Blob, opts: FileSourceOptions = {}): Promise<SubtitleSource> => {
  const meter = new Meter();
  const t = performance.now();
  const base = await indexAss(file, opts);
  const indexMs = performance.now() - t;
  const ix = new AssIndex(base.data, counting(file, meter));
  return {
    kind: 'ass-file',
    script: { info: ix.script.info, styles: ix.script.styles, warnings: ix.script.warnings },
    duration: ix.duration,
    eventCount: ix.data.events,
    readWindow: (t0, t1, signal) => meter.time(async () => filterWindow(await ix.readWindow(t0, t1, signal), t0, t1)),
    fontSection: async () => {
      const f = ix.data.fonts;
      return f ? new TextDecoder().decode(await file.slice(f.off, f.off + f.len).arrayBuffer()) : null;
    },
    stats: () => ({ bytesRead: meter.bytesRead, decodeMs: meter.decodeMs, indexMs }),
  };
};
