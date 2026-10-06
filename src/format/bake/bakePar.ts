import { pump, type XparInput } from '../pump';
import type { EncodeOptions, Sink } from '../writer';

import { Baker, type BakeStats } from './baker';
import type { BakeParams } from './params';

export type ParParams = Partial<BakeParams> & { fps: number };

const sizeOf = (i: XparInput): number | undefined => (i instanceof Uint8Array ? i.length : typeof Blob !== 'undefined' && i instanceof Blob ? i.size : undefined);

/** Streaming lossy encode: `.par` bytes go to `sink` as chunks complete. Honors `opts.onProgress` / `opts.signal`. */
export const encodeParTo = async (input: XparInput, params: ParParams, sink: Sink, opts: EncodeOptions = {}): Promise<BakeStats> => {
  const b = new Baker(sink, params, { totalBytes: sizeOf(input), ...opts });
  await pump(input, (c) => b.push(c));
  await b.finish();
  return b.stats;
};

/**
 * ASS (bytes, string, Blob or stream) => `.par` bytes plus statistics. LOSSY, one-way. Unlike XPAR there is no
 * stored fallback: a `.par` always contains the baked script (for tiny inputs it can be larger than the ASS).
 */
export const bakePar = async (input: XparInput, params: ParParams, opts: EncodeOptions = {}): Promise<{ bytes: Uint8Array; stats: BakeStats }> => {
  const parts: Uint8Array[] = [];
  const stats = await encodeParTo(input, params, (u) => void parts.push(u), opts);
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    bytes.set(p, o);
    o += p.length;
  }
  return { bytes, stats };
};

/** Same shape as `encodeXpar`: returns the `.par` bytes only. */
export const encodePar = async (input: XparInput, params: ParParams, opts: EncodeOptions = {}): Promise<Uint8Array> => (await bakePar(input, params, opts)).bytes;
