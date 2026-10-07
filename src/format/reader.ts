import { parseDialogue, V4_EVENT_FORMAT, V4P_EVENT_FORMAT } from '../parser/EventParser';
import { parseScript } from '../parser/ScriptParser';
import { splitKeyValue } from '../parser/sections';
import type { AssEvent, ParsedScript } from '../types/script';

import { decodeChunk, type DecodedEvent } from './chunk';
import { decodeBlock } from './codec';
import { decodeXpar, decodeXparTo } from './fullDecode';
import { toHex, Sha256 } from './sha256';
import type { Sink } from './writer';
import { FLAG_LOSSY } from './container';
import { crc32 } from './crc32';
import { fromUtf8 } from './bytes';
import { fail } from './errors';
import type { ChunkRef } from './indexBlock';
import type { FontRef, Meta, Provenance } from './meta';
import type { ByteSource } from './source';
import { ByteLru } from '../util/ByteLru';
import { throwIfAborted, yieldNow } from '../util/cancel';

const KEPT_SECTIONS = new Set(['script info', 'v4+ styles', 'v4 styles', 'v4 styles+', 'events']);
/** Decoded chunks held (bytes of line text, estimated): a time window touches many chunks of a file-ordered script. */
const CACHE_BYTES = 64 << 20;
const chunkBytes = (ev: DecodedEvent[]): number => ev.reduce((n, e) => n + e.line.length * 2 + 80, 0);

export interface XparFont {
  name: string;
  /** Bytes of the font itself. */
  size: number;
  /** Bytes it takes in the file (smaller when deflated). */
  stored: number;
  /** The original bytes, checked against their CRC-32. */
  read(): Promise<Uint8Array>;
}

/** Header-only ASS text (Script Info, Styles, Events Format) rebuilt from the verbatim lines of the file. */
const headerText = (meta: Meta): string => {
  const lines: string[] = [];
  let keep = false;
  for (const l of meta.misc) {
    let s: string;
    try {
      s = fromUtf8(l.bytes);
    } catch {
      continue;
    }
    const h = /^\[(.+)\]$/.exec(s.trim());
    if (h) keep = KEPT_SECTIONS.has(h[1].trim().toLowerCase());
    if (keep) lines.push(s);
  }
  return lines.join('\n');
};

export class XparFile {
  readonly lossy: boolean;
  readonly script: ParsedScript;
  private readonly cache = new ByteLru<number, DecodedEvent[]>(CACHE_BYTES);
  private readonly inflight = new Map<number, Promise<DecodedEvent[]>>();
  private readonly formats: string[][];

  /** True when the file was in the stored form (verbatim ASS); the chunk structure is then rebuilt in memory. */
  stored = false;

  constructor(readonly meta: Meta, readonly chunks: readonly ChunkRef[], private readonly src: ByteSource, flags: number) {
    this.lossy = (flags & FLAG_LOSSY) !== 0;
    this.script = parseScript(headerText(meta));
    this.formats = meta.formats.map((f) => f.split(','));
  }

  /** Last event end in seconds. */
  get duration(): number {
    return this.meta.durationMs / 1000;
  }
  get header(): string {
    return headerText(this.meta);
  }
  get provenance(): Provenance | null {
    return this.meta.prov;
  }

  /**
   * The original ASS, byte for byte (lossless XPAR only; a lossy PAR throws UNSUPPORTED because the original cannot be
   * reproduced). The result is checked against the SHA-256 stored in the file unless `verify: false`.
   */
  async toAss(opts: { verify?: boolean } = {}): Promise<Uint8Array> {
    if (this.lossy) fail('UNSUPPORTED', 'this is a lossy PAR file: the original ASS cannot be reproduced (use toBakedAss())');
    const out = await decodeXpar(this);
    const p = this.meta.prov;
    if (opts.verify !== false && p && toHex(new Sha256().update(out).digest()) !== toHex(p.sha256)) fail('CHECKSUM', 'decoded ASS does not match the stored SHA-256');
    return out;
  }

  /** Streams the document to `sink` (original bytes for XPAR, the baked ASS for PAR). */
  toAssTo(sink: Sink): Promise<void> {
    return decodeXparTo(this, sink);
  }

  /** The decodable ASS of any file: original for XPAR, the baked (approximate) script for PAR. */
  toBakedAss(): Promise<Uint8Array> {
    return decodeXpar(this);
  }

  get params(): unknown {
    return this.meta.params ? JSON.parse(this.meta.params) : null;
  }
  get fonts(): XparFont[] {
    return this.meta.fonts.map((f: FontRef) => ({
      name: f.name,
      size: f.rawLen,
      stored: f.len,
      read: async () => {
        const b = await decodeBlock(await this.src.read(f.offset, f.len), f.codec, f.rawLen);
        if (crc32(b) !== f.crc) fail('CHECKSUM', `font ${f.name} is corrupt`);
        return b;
      },
    }));
  }

  /** True when the chunk is decoded already (reading it costs no decode time). */
  warm(i: number): boolean {
    return this.cache.has(i);
  }

  /** Reads, checks and decodes one chunk (cached, byte-capped; a chunk being decoded is shared by concurrent readers). */
  chunk(i: number): Promise<DecodedEvent[]> {
    const hit = this.cache.get(i);
    if (hit) return Promise.resolve(hit);
    let p = this.inflight.get(i);
    if (!p) {
      const ref = this.chunks[i];
      if (!ref) return Promise.reject(new RangeError('no such chunk'));
      p = this.load(ref).then((ev) => { this.cache.set(i, ev, chunkBytes(ev)); return ev; }).finally(() => this.inflight.delete(i));
      this.inflight.set(i, p);
    }
    return p;
  }

  private async load(ref: ChunkRef): Promise<DecodedEvent[]> {
    const data = await this.src.read(ref.offset, ref.len);
    if (crc32(data) !== ref.crc) fail('CHECKSUM', `chunk at offset ${ref.offset} is corrupt`);
    const raw = await decodeBlock(data, ref.codec, ref.rawLen);
    const ev = decodeChunk(raw, ref.count);
    if (ev.length !== ref.count) fail('CORRUPT', 'event count mismatch');
    return ev;
  }

  /** Chunk indices that can hold an event visible in [t0, t1) seconds. */
  chunksFor(t0: number, t1: number): number[] {
    const a = t0 * 1000 - 1;
    const b = t1 * 1000 + 1;
    const out: number[] = [];
    this.chunks.forEach((c, i) => {
      if (c.count > 0 && c.minStartMs < b && c.maxEndMs > a) out.push(i);
    });
    return out;
  }

  private eventFormat(fmt: number): string[] {
    if (fmt >= 0) return this.formats[fmt] ?? fail('CORRUPT', 'bad format id');
    return /^v4\.00$/i.test(this.script.info.scriptType.trim()) ? V4_EVENT_FORMAT : V4P_EVENT_FORMAT;
  }

  /** Dialogue lines (as decoded text) visible in [t0, t1), in file order, with their ordinals. */
  async readWindowLines(t0: number, t1: number, signal?: AbortSignal): Promise<Array<{ ordinal: number; fmt: number; line: string }>> {
    throwIfAborted(signal);
    const picked: DecodedEvent[] = [];
    const a = t0 * 1000 - 1;
    const b = t1 * 1000 + 1;
    for (const i of this.chunksFor(t0, t1)) {
      throwIfAborted(signal);
      // A cold chunk costs a decode: let queued messages (a Worker's `cancel`) in first, a stale read stops here.
      if (signal && !this.warm(i)) { await yieldNow(); throwIfAborted(signal); }
      for (const e of await this.chunk(i)) {
        if (e.comment) continue;
        if (!e.raw && !(e.startMs < b && e.endMs > a)) continue;
        picked.push(e);
      }
    }
    picked.sort((x, y) => x.ordinal - y.ordinal);
    return picked.map((e) => ({ ordinal: e.ordinal, fmt: e.fmt, line: e.line }));
  }

  /** Parsed events visible in [t0, t1): the same structures `parseScript` yields (same ids, same order). */
  async readWindow(t0: number, t1: number, signal?: AbortSignal): Promise<AssEvent[]> {
    const out: AssEvent[] = [];
    let n = 0;
    for (const l of await this.readWindowLines(t0, t1, signal)) {
      if ((++n & 255) === 0) throwIfAborted(signal);
      const kv = splitKeyValue(l.line.replace(/^\s+/, ''));
      const ev = kv ? parseDialogue(this.eventFormat(l.fmt), kv[1], l.ordinal) : null;
      if (ev && typeof ev !== 'string' && ev.start < t1 && ev.end > t0) out.push(ev);
    }
    return out;
  }

  /** Mini ASS document (header + the window's events) that any ASS consumer, including PAR, can load. */
  async readWindowText(t0: number, t1: number): Promise<string> {
    const lines = await this.readWindowLines(t0, t1);
    return `${this.header}\n${lines.map((l) => l.line).join('\n')}\n`;
  }
}
