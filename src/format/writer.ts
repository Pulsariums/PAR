import { ChunkBuilder, type ChunkEvent } from './chunk';
import { CODEC_DEFLATE, CODEC_IDS, CODEC_RCF, CODEC_STORED, deflateRaw, encodeBlock, type CodecName } from './codec';
import { crc32 } from './crc32';
import { FLAG_LOSSY, writeFooter, writeHeader, type BlockRef } from './container';
import { fail } from './errors';
import { encodeIndex, type ChunkRef } from './indexBlock';
import { encodeMeta, type FontRef, type Meta, type MiscLine, type Provenance } from './meta';

export interface EncodeOptions {
  /** Entropy coder: `'rc'` (own ASS-stream context-mixing range coder, default), `'deflate'` (CompressionStream), `'stored'`. */
  codec?: CodecName;
  /** Close a chunk after this much source text... */
  chunkBytes?: number;
  /** ...or once it spans this many ms of event start times AND holds at least `minChunkBytes`. */
  chunkMs?: number;
  minChunkBytes?: number;
  /** Chunks never span more than this (ms), however small. */
  maxSpanMs?: number;
  /** Events at least this long (ms) go to the long lane. */
  longMs?: number;
  /** Font files to attach, kept byte for byte (deflated when that saves at least 3 %); `file.fonts` gives them back. */
  fonts?: Array<{ name: string; data: Uint8Array }>;
  /** Progress callback (after each input slice). `fraction` is set when `totalBytes` is known. */
  onProgress?: (p: Progress) => void;
  /** Total input size when known (enables `fraction`). */
  totalBytes?: number;
  /** Cancels the encode: the promise rejects with XparError('ABORTED'). */
  signal?: AbortSignal;
}

export interface Progress {
  bytesIn: number;
  bytesOut: number;
  events: number;
  fraction: number | null;
}

export type Sink = (bytes: Uint8Array) => void | Promise<void>;

export const DEFAULTS = { chunkBytes: 512 * 1024, chunkMs: 2000, minChunkBytes: 131072, maxSpanMs: 1800000, longMs: 20_000 };

/** Builds the container: lanes of open chunks, flushes them to the sink, writes meta/index/footer on `finish`. */
export class XparWriter {
  private readonly lanes: [ChunkBuilder, ChunkBuilder] = [new ChunkBuilder(), new ChunkBuilder()];
  private readonly refs: ChunkRef[] = [];
  private readonly codec: number;
  private readonly metaCodec: number;
  get bytesOut(): number {
    return this.offset;
  }
  get eventCount(): number {
    return this.events;
  }
  private readonly o: Required<Pick<EncodeOptions, 'chunkBytes' | 'chunkMs' | 'minChunkBytes' | 'maxSpanMs' | 'longMs'>>;
  private readonly ready: Array<[number, ChunkBuilder]> = [];
  private offset = 0;
  private started = false;
  private finished = false;
  private events = 0;
  private durationMs = 0;
  readonly misc: MiscLine[] = [];
  readonly fonts: FontRef[] = [];

  constructor(private readonly sink: Sink, opts: EncodeOptions = {}, private readonly lossy = false) {
    this.codec = CODEC_IDS[opts.codec ?? 'rc'];
    this.metaCodec = (opts.codec ?? 'rc') === 'deflate' ? CODEC_DEFLATE : CODEC_RCF;
    this.o = { ...DEFAULTS, ...strip(opts) };
    this.fontData = opts.fonts ?? [];
  }
  private readonly fontData: Array<{ name: string; data: Uint8Array }>;

  private async out(b: Uint8Array): Promise<void> {
    await this.sink(b);
    this.offset += b.length;
  }

  private async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.out(writeHeader(this.lossy ? FLAG_LOSSY : 0));
    const seen = new Set<string>();
    for (const f of this.fontData) {
      const crc = crc32(f.data);
      const id = `${f.name}\0${f.data.length}\0${crc}`;
      if (seen.has(id)) continue; // the same file added twice
      seen.add(id);
      // Fonts are kept byte for byte: deflate when it saves at least 3 %, else as they are (WOFF, WOFF2 and most CJK fonts are compressed already).
      const z = f.data.length >= 256 ? await deflateRaw(f.data) : f.data;
      const packed = z.length < f.data.length * 0.97;
      const body = packed ? z : f.data;
      this.fonts.push({ name: f.name, offset: this.offset, len: body.length, rawLen: f.data.length, codec: packed ? CODEC_DEFLATE : CODEC_STORED, crc });
      await this.out(body);
    }
  }

  /** Buffers one event; closed chunks queue up until `flushDue()` writes them out. */
  addEvent(ev: ChunkEvent, srcBytes: number): void {
    const lane = ev.endMs - ev.startMs >= this.o.longMs ? 1 : 0;
    const b = this.lanes[lane];
    b.add(ev, srcBytes);
    this.events++;
    if (ev.endMs > this.durationMs) this.durationMs = ev.endMs;
    if (this.due(b)) this.close(lane);
  }

  private due(b: ChunkBuilder): boolean {
    const o = this.o;
    const span = b.maxStartMs - b.minStartMs;
    return b.srcBytes >= o.chunkBytes || (span >= o.chunkMs && b.srcBytes >= o.minChunkBytes) || span >= o.maxSpanMs;
  }

  private close(lane: number): void {
    if (this.lanes[lane].count === 0) return;
    this.ready.push([lane, this.lanes[lane]]);
    this.lanes[lane] = new ChunkBuilder();
  }

  async flushDue(): Promise<void> {
    await this.start();
    while (this.ready.length) {
      const [lane, b] = this.ready.shift()!;
      await this.write(lane, b);
    }
  }

  private async write(lane: number, b: ChunkBuilder): Promise<void> {
    const raw = b.finish();
    const data = await encodeBlock(raw, this.codec);
    const ref: ChunkRef = {
      offset: this.offset, len: data.length, rawLen: raw.length, codec: this.codec, lane, count: b.count,
      minStartMs: b.minStartMs, maxEndMs: b.maxEndMs, minLine: b.minLine, maxLine: b.maxLine, crc: crc32(data),
    };
    await this.out(data);
    this.refs.push(ref);
  }

  private async block(raw: Uint8Array): Promise<BlockRef> {
    const codec = raw.length < 64 ? CODEC_STORED : this.metaCodec;
    const data = await encodeBlock(raw, codec);
    const ref = { offset: this.offset, len: data.length, rawLen: raw.length, crc: crc32(data), codec };
    await this.out(data);
    return ref;
  }

  async finish(m: Pick<Meta, 'bom' | 'crlf' | 'finalNewline' | 'lines' | 'dialogues' | 'formats' | 'eolExceptions' | 'params'> & { prov: (Omit<Provenance, 'srcDurationMs'> & { srcDurationMs?: number }) | null }): Promise<void> {
    if (this.finished) fail('INVALID_INPUT', 'writer already finished');
    this.finished = true;
    await this.start();
    this.close(0);
    this.close(1);
    await this.flushDue();
    const meta = await this.block(encodeMeta({ ...m, events: this.events, durationMs: this.durationMs, misc: this.misc, fonts: this.fonts, prov: m.prov && { ...m.prov, srcDurationMs: m.prov.srcDurationMs ?? this.durationMs } }));
    const index = await this.block(encodeIndex(this.refs));
    await this.out(writeFooter({ meta, index }));
  }
}

const strip = (o: EncodeOptions): Partial<typeof DEFAULTS> => {
  const out: Partial<typeof DEFAULTS> = {};
  for (const k of Object.keys(DEFAULTS) as Array<keyof typeof DEFAULTS>) if (o[k] !== undefined) out[k] = o[k];
  return out;
};
