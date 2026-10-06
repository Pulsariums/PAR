import { utf8 } from './bytes';
import type { DecodedEvent } from './chunk';
import { fail } from './errors';
import type { XparFile } from './reader';
import type { Sink } from './writer';

interface Run {
  ev: DecodedEvent[];
  i: number;
}

const BATCH = 1 << 20;

/**
 * Writes the whole document to `sink`: the original bytes for a lossless file (byte-exact), the baked ASS for a
 * lossy one. Chunks are k-way merged by line number, so memory is bounded by the chunks whose line ranges overlap.
 */
export const decodeXparTo = async (file: XparFile, sink: Sink): Promise<void> => {
  const { meta } = file;
  const eolDefault = meta.crlf ? '\r\n' : '\n';
  const eolAlt = meta.crlf ? '\n' : '\r\n';
  const exceptions = new Set(meta.eolExceptions);
  const order = file.chunks.map((_c, i) => i).filter((i) => file.chunks[i].count > 0).sort((a, b) => file.chunks[a].minLine - file.chunks[b].minLine);
  const open: Run[] = [];
  let next = 0;
  let mi = 0;
  let expect = 0;
  let buf: Uint8Array[] = [];
  let buffered = 0;
  const put = async (b: Uint8Array): Promise<void> => {
    buf.push(b);
    buffered += b.length;
    if (buffered >= BATCH) await flush();
  };
  const flush = async (): Promise<void> => {
    if (!buffered) return;
    const out = new Uint8Array(buffered);
    let p = 0;
    for (const b of buf) {
      out.set(b, p);
      p += b.length;
    }
    buf = [];
    buffered = 0;
    await sink(out);
  };
  if (meta.bom) await put(Uint8Array.of(0xef, 0xbb, 0xbf));
  let emitted = 0;
  for (;;) {
    let best = Infinity;
    let from: Run | null = null;
    for (const r of open) {
      const k = r.ev[r.i].lineNo;
      if (k < best) {
        best = k;
        from = r;
      }
    }
    const miscKey = mi < meta.misc.length ? meta.misc[mi].lineNo : Infinity;
    const fromMisc = miscKey <= best;
    if (fromMisc) best = miscKey;
    if (next < order.length && file.chunks[order[next]].minLine <= best) {
      open.push({ ev: await file.chunk(order[next++]), i: 0 });
      continue;
    }
    if (best === Infinity) break;
    if (!file.lossy && best !== expect) fail('CORRUPT', `line ${expect} is missing`);
    expect = best + 1;
    let bytes: Uint8Array;
    if (fromMisc) bytes = meta.misc[mi++].bytes;
    else {
      const r = from!;
      bytes = utf8(r.ev[r.i++].line);
      if (r.i >= r.ev.length) open.splice(open.indexOf(r), 1);
    }
    await put(bytes);
    emitted++;
    const last = emitted === meta.lines;
    if (!last || meta.finalNewline) await put(utf8(exceptions.has(best) ? eolAlt : eolDefault));
  }
  if (!file.lossy && emitted !== meta.lines) fail('CORRUPT', 'line count mismatch');
  await flush();
};

/** Whole document in memory (small files, tests). */
export const decodeXpar = async (file: XparFile): Promise<Uint8Array> => {
  const parts: Uint8Array[] = [];
  await decodeXparTo(file, (b) => void parts.push(b));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const c of parts) {
    out.set(c, p);
    p += c.length;
  }
  return out;
};
