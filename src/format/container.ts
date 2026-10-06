import { ByteReader, ByteWriter } from './bytes';
import { crc32 } from './crc32';
import { fail, LIMITS } from './errors';

/**
 * Container layout (all integers little endian, see docs/formats/XPAR.md):
 *   header(16) | font blobs | chunks... | meta block | index block | footer(52)
 */
export const MAGIC = [0x58, 0x50, 0x41, 0x52]; // "XPAR"
export const END_MAGIC = [0x58, 0x45, 0x4e, 0x44]; // "XEND"
export const VERSION_MAJOR = 1;
export const VERSION_MINOR = 0;
export const HEADER_SIZE = 16;
export const FOOTER_SIZE = 52;
export const FLAG_LOSSY = 1;
/** Whole file is the verbatim ASS after the 16-byte header, followed by its CRC-32 (used when modelling would not help). */
export const FLAG_STORED = 2;
/** Bits a reader does not know => refuse (forward-compat rule: unknown flag bits in the low byte are critical). */
const CRITICAL_MASK = 0x00ff;
const KNOWN_FLAGS = FLAG_LOSSY | FLAG_STORED;

export interface Header {
  major: number;
  minor: number;
  flags: number;
}

export const writeHeader = (flags: number): Uint8Array => {
  const w = new ByteWriter(16);
  for (const b of MAGIC) w.u8(b);
  w.u8(VERSION_MAJOR);
  w.u8(VERSION_MINOR);
  w.u8(flags & 255);
  w.u8(flags >> 8);
  w.u32(0);
  w.u32(crc32(w.view()));
  return w.view();
};

export const readHeader = (b: Uint8Array): Header => {
  if (b.length < HEADER_SIZE) fail('TRUNCATED', 'file is shorter than the header');
  if (MAGIC.some((m, i) => b[i] !== m)) fail('BAD_MAGIC', 'not an XPAR/PAR file');
  const r = new ByteReader(b.subarray(0, HEADER_SIZE));
  r.pos = 4;
  const major = r.u8();
  const minor = r.u8();
  const flags = r.u8() | (r.u8() << 8);
  r.u32();
  if (crc32(b.subarray(0, 12)) !== r.u32()) fail('CHECKSUM', 'header checksum mismatch');
  if (major !== VERSION_MAJOR) fail('BAD_VERSION', `unsupported major version ${major}`);
  if (flags & CRITICAL_MASK & ~KNOWN_FLAGS) fail('UNSUPPORTED', `unknown critical flags 0x${flags.toString(16)}`);
  return { major, minor, flags };
};

export interface BlockRef {
  offset: number;
  len: number;
  rawLen: number;
  crc: number;
  codec: number;
}

export interface Footer {
  meta: BlockRef;
  index: BlockRef;
}

/** meta(20) index(20) codecs(2) reserved(2) crc32 of the first 44 bytes(4) "XEND"(4) */
export const writeFooter = (f: Footer): Uint8Array => {
  const w = new ByteWriter(FOOTER_SIZE);
  for (const b of [f.meta, f.index]) {
    w.u64(b.offset);
    w.u32(b.len);
    w.u32(b.rawLen);
    w.u32(b.crc);
  }
  w.u8(f.meta.codec);
  w.u8(f.index.codec);
  w.u8(0);
  w.u8(0);
  w.u32(crc32(w.view()));
  for (const b of END_MAGIC) w.u8(b);
  return w.view();
};

export const readFooter = (b: Uint8Array, fileSize: number): Footer => {
  if (b.length !== FOOTER_SIZE) fail('TRUNCATED', 'footer missing');
  if (END_MAGIC.some((m, i) => b[48 + i] !== m)) fail('TRUNCATED', 'end marker missing (file truncated or not finished)');
  if (crc32(b.subarray(0, 44)) !== new ByteReader(b.subarray(44)).u32()) fail('CHECKSUM', 'footer checksum mismatch');
  const r = new ByteReader(b);
  const ref = (): BlockRef => ({ offset: r.u64(), len: r.u32(), rawLen: r.u32(), crc: r.u32(), codec: 0 });
  const meta = ref();
  const index = ref();
  meta.codec = r.u8();
  index.codec = r.u8();
  const limit = fileSize - FOOTER_SIZE;
  for (const x of [meta, index]) {
    if (x.offset < HEADER_SIZE || x.offset + x.len > limit) fail('CORRUPT', 'block outside the file');
    if (x.rawLen > LIMITS.maxMetaRaw) fail('LIMIT', 'block too large');
  }
  return { meta, index };
};
