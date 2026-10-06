import { decodeBlock } from './codec';
import { FLAG_LOSSY, FLAG_STORED, FOOTER_SIZE, HEADER_SIZE, MAGIC, readFooter, readHeader, type BlockRef } from './container';
import { crc32 } from './crc32';
import { encodeContainer, readStored } from './encodeApi';
import { fail } from './errors';
import { decodeIndex } from './indexBlock';
import { decodeMeta } from './meta';
import { XparFile } from './reader';
import { toHex } from './sha256';
import { toSource, type ByteSource, type XparSource } from './source';
import { FORMAT_VERSION } from './version';

const readBlock = async (src: ByteSource, ref: BlockRef): Promise<Uint8Array> => {
  const data = await src.read(ref.offset, ref.len);
  if (crc32(data) !== ref.crc) fail('CHECKSUM', 'metadata block is corrupt');
  return decodeBlock(data, ref.codec, ref.rawLen);
};

/** Opens a `.xpar` / `.par` from a Blob/File, Uint8Array, URL (HTTP Range) or custom ByteSource. Reads only header, footer, meta, index. */
export const openXpar = async (source: XparSource): Promise<XparFile> => {
  const src = toSource(source);
  const size = await src.size();
  if (size < HEADER_SIZE) fail('TRUNCATED', 'file is too small to be an XPAR/PAR file');
  const header = readHeader(await src.read(0, HEADER_SIZE));
  if (header.flags & FLAG_STORED) {
    const payload = readStored(await src.read(0, size));
    const f = await openXpar(await encodeContainer(payload, { codec: 'stored' }));
    f.stored = true;
    return f;
  }
  if (size < HEADER_SIZE + FOOTER_SIZE) fail('TRUNCATED', 'file is too small to be an XPAR/PAR file');
  const footer = readFooter(await src.read(size - FOOTER_SIZE, FOOTER_SIZE), size);
  const meta = decodeMeta(await readBlock(src, footer.meta));
  const chunks = decodeIndex(await readBlock(src, footer.index), HEADER_SIZE, size - FOOTER_SIZE);
  return new XparFile(meta, chunks, src, header.flags);
};

/** What a UI needs to describe a file without decoding events. */
export interface ParHeader {
  /** True for PAR: the original ASS cannot be reproduced. */
  lossy: boolean;
  /** Target frame rate of a lossy file (null for lossless). */
  fps: number | null;
  /** SHA-256 (hex) of the original ASS (for PAR: of the ASS it was baked from). */
  sourceSha256: string | null;
  sourceBytes: number | null;
  /** Source duration in seconds. */
  sourceDuration: number | null;
  encoder: string | null;
  formatVersion: string;
  /** Human-readable warning for lossy files. */
  notice: string | null;
  /** Baker parameters and statistics (lossy files). */
  params: unknown;
}

export const parHeader = (f: XparFile): ParHeader => {
  const p = f.meta.prov;
  return {
    lossy: f.lossy,
    fps: p && p.fpsX1000 ? p.fpsX1000 / 1000 : null,
    sourceSha256: p ? toHex(p.sha256) : null,
    sourceBytes: p?.srcBytes ?? null,
    sourceDuration: p ? p.srcDurationMs / 1000 : null,
    encoder: p?.encoder ?? null,
    formatVersion: FORMAT_VERSION,
    notice: f.lossy ? `Lossy PAR${p?.fpsX1000 ? ` baked for ${p.fpsX1000 / 1000} fps` : ''}: the original ASS cannot be reproduced from this file.` : null,
    params: f.params,
  };
};

/** Opens a lossy `.par` (a lossless file is refused with UNSUPPORTED so a UI cannot mistake one for the other). */
export const openPar = async (source: XparSource): Promise<{ file: XparFile; header: ParHeader; lossy: true }> => {
  const file = await openXpar(source);
  if (!file.lossy) fail('UNSUPPORTED', 'this is a lossless XPAR file, not a lossy PAR (use openXpar)');
  return { file, header: parHeader(file), lossy: true };
};

export type SniffKind = 'xpar' | 'par' | 'ass' | 'unknown';

/** File type from the first bytes (>= 16 bytes for containers, a few hundred for ASS text). */
export const sniff = (b: Uint8Array): { kind: SniffKind; stored: boolean; version: string | null } => {
  if (b.length >= 16 && MAGIC.every((m, i) => b[i] === m)) {
    const flags = b[6] | (b[7] << 8);
    return { kind: flags & FLAG_LOSSY ? 'par' : 'xpar', stored: (flags & FLAG_STORED) !== 0, version: `${b[4]}.${b[5]}` };
  }
  const s = new TextDecoder().decode(b.subarray(0, 4096)).replace(/^\uFEFF/, '');
  const ass = /^\s*(?:;[^\n]*\n\s*)*\[(?:script info|v4\+? styles|events)\]/i.test(s.replace(/^﻿/, ''));
  return { kind: ass ? 'ass' : 'unknown', stored: false, version: null };
};

/** Suggested names: lossless `name.xpar`, lossy `name.<fps>fps.par`. */
export const FILE_TYPES = {
  xpar: { extension: '.xpar', mime: 'application/vnd.pulsar.xpar' },
  par: { extension: '.par', mime: 'application/vnd.pulsar.par' },
  ass: { extension: '.ass', mime: 'text/x-ssa' },
} as const;

export const parFileName = (base: string, fps: number): string => `${base}.${Number.isInteger(fps) ? fps : String(fps)}fps.par`;
