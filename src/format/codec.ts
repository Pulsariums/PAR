import { fail } from './errors';
import { rcDecodeFlat, rcEncodeFlat } from './rc';
import { rcDecodeFast, rcEncodeFast } from './rcFast';

/** Entropy coders. The id is stored per block, so a file may mix them and old readers fail with a clear error. */
export const CODEC_STORED = 0;
export const CODEC_DEFLATE = 1;
export const CODEC_RC = 2;
export const CODEC_RCF = 3;
export type CodecName = 'stored' | 'deflate' | 'rc';
export const CODEC_IDS: Record<CodecName, number> = { stored: CODEC_STORED, deflate: CODEC_DEFLATE, rc: CODEC_RC };

const concat = (parts: Uint8Array[], total: number): Uint8Array => {
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of parts) {
    out.set(c, p);
    p += c.length;
  }
  return out;
};

/** Runs `data` through a (De)CompressionStream; output beyond `max` bytes aborts (decompression-bomb guard). */
const pipeThrough = async (data: Uint8Array, ts: { writable: WritableStream<Uint8Array>; readable: ReadableStream<Uint8Array> }, max: number): Promise<Uint8Array> => {
  const writer = ts.writable.getWriter();
  const writing = writer.write(data).then(() => writer.close());
  writing.catch(() => undefined);
  const reader = ts.readable.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) {
        await reader.cancel().catch(() => undefined);
        return fail('LIMIT', 'decompressed size exceeds the declared size');
      }
      parts.push(value);
    }
    await writing;
  } catch (e) {
    if (e instanceof Error && e.name === 'XparError') throw e;
    return fail('CORRUPT', 'deflate stream is corrupt');
  }
  return concat(parts, total);
};

export const deflateRaw = (data: Uint8Array): Promise<Uint8Array> =>
  pipeThrough(data, new CompressionStream('deflate-raw') as never, Infinity);

export const inflateRaw = async (data: Uint8Array, rawLen: number): Promise<Uint8Array> => {
  const out = await pipeThrough(data, new DecompressionStream('deflate-raw') as never, rawLen);
  if (out.length !== rawLen) fail('CORRUPT', 'decompressed size mismatch');
  return out;
};

export const encodeBlock = async (raw: Uint8Array, codec: number): Promise<Uint8Array> => {
  if (codec === CODEC_STORED) return raw;
  if (codec === CODEC_DEFLATE) return deflateRaw(raw);
  if (codec === CODEC_RC) return rcEncodeFast(raw);
  if (codec === CODEC_RCF) return rcEncodeFlat(raw);
  return fail('UNSUPPORTED', `unknown codec ${codec}`);
};

/** `rawLen` comes from the (checksummed) index and bounds the output. */
export const decodeBlock = async (data: Uint8Array, codec: number, rawLen: number): Promise<Uint8Array> => {
  if (codec === CODEC_STORED) {
    if (data.length !== rawLen) fail('CORRUPT', 'stored block size mismatch');
    return data;
  }
  if (codec === CODEC_DEFLATE) return inflateRaw(data, rawLen);
  if (codec === CODEC_RC) return rcDecodeFast(data, rawLen);
  if (codec === CODEC_RCF) return rcDecodeFlat(data, rawLen);
  return fail('UNSUPPORTED', `unknown codec ${codec}`);
};
