import { FLAG_STORED, HEADER_SIZE, readHeader, writeHeader } from './container';
import { crc32 } from './crc32';
import { XparEncoder } from './encoder';
import { fail, XparError } from './errors';
import { collect, pump, type XparInput } from './pump';
import { DEFAULTS, type EncodeOptions, type Sink } from './writer';

/** Container encode without the "never larger than the input" fallback. */
export const encodeContainer = async (input: XparInput, opts: EncodeOptions = {}): Promise<Uint8Array> => {
  const c = collect();
  const enc = new XparEncoder(c.sink, { totalBytes: knownSize(input), ...opts });
  await pump(input, (b) => enc.push(b));
  await enc.finish();
  return c.result();
};

const knownSize = (i: XparInput): number | undefined =>
  typeof i === 'string' ? undefined : i instanceof Uint8Array ? i.length : typeof Blob !== 'undefined' && i instanceof Blob ? i.size : undefined;

/** Stored form: header + the ASS bytes + CRC-32. Output is input + 20 bytes at worst. */
export const storedForm = (input: Uint8Array): Uint8Array => {
  const out = new Uint8Array(HEADER_SIZE + input.length + 4);
  out.set(writeHeader(FLAG_STORED));
  out.set(input, HEADER_SIZE);
  new DataView(out.buffer).setUint32(out.length - 4, crc32(input), true);
  return out;
};

export const readStored = (file: Uint8Array): Uint8Array => {
  const h = readHeader(file);
  if (!(h.flags & FLAG_STORED)) fail('INVALID_INPUT', 'not a stored-form file');
  if (file.length < HEADER_SIZE + 4) throw new XparError('TRUNCATED', 'stored file is truncated');
  const body = file.subarray(HEADER_SIZE, file.length - 4);
  if (crc32(body) !== new DataView(file.buffer, file.byteOffset, file.length).getUint32(file.length - 4, true)) fail('CHECKSUM', 'stored payload is corrupt');
  return body;
};

const KEEP_LIMIT = 8 * 1024 * 1024;

/**
 * Encodes a whole input. The result is NEVER larger than input + 20 bytes: when modelling does not pay (tiny or
 * incompressible files) the stored form is emitted instead. Streams are never held whole: only inputs up to 8 MiB are kept for that check.
 */
export const encodeXpar = async (input: XparInput, opts: EncodeOptions = {}): Promise<Uint8Array> => {
  let keep: Uint8Array | null = null;
  if (typeof input === 'string') keep = new TextEncoder().encode(input);
  else if (input instanceof Uint8Array) keep = input;
  else if (typeof Blob !== 'undefined' && input instanceof Blob && input.size <= KEEP_LIMIT) keep = new Uint8Array(await input.arrayBuffer());
  const x = await encodeContainer(keep ?? input, opts);
  // The stored form has no room for attachments: with fonts the container is always written.
  return keep && !opts.fonts?.length && x.length > keep.length + 20 ? storedForm(keep) : x;
};

/** Streaming variant: output goes to `sink` as chunks complete (small known inputs go through `encodeXpar` and its stored fallback). */
export const encodeXparTo = async (input: XparInput, sink: Sink, opts: EncodeOptions = {}): Promise<void> => {
  const size = typeof input === 'string' ? input.length : knownSize(input);
  if (size !== undefined && size <= KEEP_LIMIT / 2) return void (await sink(await encodeXpar(input, opts)));
  const enc = new XparEncoder(sink, { totalBytes: size, ...opts });
  await pump(input, (b) => enc.push(b));
  await enc.finish();
};

export { DEFAULTS };
