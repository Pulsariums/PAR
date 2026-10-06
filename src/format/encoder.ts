import { modelFields, type ChunkEvent } from './chunk';
import { fail, XparError } from './errors';
import { FLAG_STORED, HEADER_SIZE, readHeader, writeHeader } from './container';
import { crc32 } from './crc32';
import { Sha256 } from './sha256';
import { ENCODER_ID } from './version';
import { LineSplitter } from './lines';
import { LineScanner } from './scan';
import { DEFAULTS, XparWriter, type EncodeOptions, type Sink } from './writer';

export { HEADER_SIZE, readHeader };

const DEC = new TextDecoder('utf-8', { fatal: true });
const join2 = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
};
const strict = (b: Uint8Array): string | null => {
  try {
    return DEC.decode(b);
  } catch {
    return null;
  }
};

/**
 * Lossless streaming encoder: feed file bytes with `push`, finish with `finish`. Memory is bounded by the
 * open chunks (about `chunkBytes` of source each), never by the file size.
 */
export class XparEncoder {
  private readonly splitter = new LineSplitter();
  private readonly scanner = new LineScanner();
  private readonly writer: XparWriter;
  private lineNo = 0;
  private bomDone = false;
  private bom = false;
  private crlf: boolean | null = null;
  private lastEol: 0 | 1 | 2 = 1;
  private readonly eolExceptions: number[] = [];
  private head: Uint8Array | null = null;
  private readonly sha = new Sha256();
  private bytesIn = 0;

  constructor(sink: Sink, private readonly opts: EncodeOptions = {}) {
    this.writer = new XparWriter(sink, opts);
  }

  private line = (bytes: Uint8Array, eol: 0 | 1 | 2): void => {
    const n = this.lineNo++;
    this.lastEol = eol;
    if (eol !== 0) {
      if (this.crlf === null) this.crlf = eol === 2;
      else if ((eol === 2) !== this.crlf) this.eolExceptions.push(n);
    }
    const text = strict(bytes);
    const cls = text === null ? null : this.scanner.scan(text);
    if (!cls || cls.t === 'misc') {
      this.writer.misc.push({ lineNo: n, bytes: bytes.slice() });
      return;
    }
    const std = cls.fmt >= 0 && this.scanner.formats[cls.fmt].standard;
    const m = std ? modelFields(text!, cls.comment) : null;
    const ev: ChunkEvent = m
      ? { lineNo: n, comment: cls.comment, ordinal: cls.ordinal, startMs: m.startCs * 10, endMs: m.endCs * 10, fmt: cls.fmt, raw: null, m }
      : { lineNo: n, comment: cls.comment, ordinal: cls.ordinal, startMs: cls.startMs, endMs: cls.endMs, fmt: cls.fmt, raw: text!, m: null };
    this.writer.addEvent(ev, bytes.length + 1);
  };

  async push(chunk: Uint8Array): Promise<void> {
    if (this.opts.signal?.aborted) fail('ABORTED', 'encode cancelled');
    this.sha.update(chunk);
    this.bytesIn += chunk.length;
    await this.pushRaw(chunk);
    this.opts.onProgress?.({ bytesIn: this.bytesIn, bytesOut: this.writer.bytesOut, events: this.writer.eventCount, fraction: this.opts.totalBytes ? Math.min(1, this.bytesIn / this.opts.totalBytes) : null });
  }

  private async pushRaw(chunk: Uint8Array): Promise<void> {
    if (!this.bomDone) {
      // A BOM may straddle tiny chunks: buffer until 3 bytes are known.
      if (chunk.length === 0) return;
      const joined = this.head ? join2(this.head, chunk) : chunk;
      if (joined.length < 3) {
        this.head = joined.slice();
        return;
      }
      this.head = null;
      this.bomDone = true;
      this.bom = joined[0] === 0xef && joined[1] === 0xbb && joined[2] === 0xbf;
      chunk = this.bom ? joined.subarray(3) : joined;
    }
    this.splitter.push(chunk, this.line);
    await this.writer.flushDue();
  }

  async finish(): Promise<void> {
    if (this.head) {
      const h = this.head;
      this.head = null;
      this.bomDone = true;
      this.splitter.push(h, this.line);
    }
    this.splitter.end(this.line);
    await this.writer.finish({
      bom: this.bom,
      crlf: this.crlf === true,
      finalNewline: this.lineNo > 0 && this.lastEol !== 0,
      lines: this.lineNo,
      dialogues: this.scanner.ordinal,
      formats: this.scanner.formats.map((f) => f.names.join(',')),
      eolExceptions: this.eolExceptions,
      params: '',
      prov: { kind: 0, sha256: this.sha.digest(), srcBytes: this.bytesIn, fpsX1000: 0, encoder: ENCODER_ID },
    });
  }
}

export type XparInput = string | Uint8Array | Blob | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>;
const SLICE = 1 << 20;

/** Feeds any input shape into an encoder in bounded slices. */
export const pump = async (input: XparInput, push: (b: Uint8Array) => Promise<void>): Promise<void> => {
  if (typeof input === 'string') input = new TextEncoder().encode(input);
  if (input instanceof Uint8Array) {
    for (let p = 0; p < input.length; p += SLICE) await push(input.subarray(p, Math.min(input.length, p + SLICE)));
    return;
  }
  if (typeof Blob !== 'undefined' && input instanceof Blob) input = input.stream();
  if (typeof (input as ReadableStream<Uint8Array>).getReader === 'function') {
    const reader = (input as ReadableStream<Uint8Array>).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      await push(value);
    }
  }
  if (Symbol.asyncIterator in (input as object)) {
    for await (const b of input as AsyncIterable<Uint8Array>) await push(b);
    return;
  }
  fail('INVALID_INPUT', 'unsupported input type');
};

const collect = (): { sink: Sink; result: () => Uint8Array } => {
  const parts: Uint8Array[] = [];
  let total = 0;
  return {
    sink: (b) => {
      parts.push(b);
      total += b.length;
    },
    result: () => {
      const out = new Uint8Array(total);
      let p = 0;
      for (const c of parts) {
        out.set(c, p);
        p += c.length;
      }
      return out;
    },
  };
};

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
  return keep && x.length > keep.length + 20 ? storedForm(keep) : x;
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
