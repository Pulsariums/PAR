import { modelFields, type ChunkEvent } from './chunk';
import { fail } from './errors';
import { Sha256 } from './sha256';
import { ENCODER_ID } from './version';
import { LineSplitter } from './lines';
import { LineScanner } from './scan';
import { XparWriter, type EncodeOptions, type Sink } from './writer';

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
