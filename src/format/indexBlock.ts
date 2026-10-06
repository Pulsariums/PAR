import { ByteReader, ByteWriter } from './bytes';
import { fail, LIMITS } from './errors';

export interface ChunkRef {
  offset: number;
  len: number;
  rawLen: number;
  codec: number;
  /** 0 = ordinary events, 1 = long-lived events (kept apart so one sign does not widen every chunk). */
  lane: number;
  count: number;
  minStartMs: number;
  maxEndMs: number;
  minLine: number;
  maxLine: number;
  crc: number;
}

export const encodeIndex = (chunks: ChunkRef[]): Uint8Array => {
  const w = new ByteWriter(64 + chunks.length * 24);
  w.uv(chunks.length);
  let end = 0;
  for (const c of chunks) {
    w.sv(c.offset - end);
    end = c.offset + c.len;
    w.uv(c.len);
    w.uv(c.rawLen);
    w.u8(c.codec);
    w.u8(c.lane);
    w.uv(c.count);
    w.sv(c.minStartMs);
    w.uv(Math.max(0, c.maxEndMs - c.minStartMs));
    w.sv(c.minLine);
    w.uv(c.maxLine - c.minLine);
    w.u32(c.crc);
  }
  return w.view();
};

export const decodeIndex = (buf: Uint8Array, dataStart: number, dataEnd: number): ChunkRef[] => {
  const r = new ByteReader(buf);
  const n = r.uv();
  if (n > LIMITS.maxIndexEntries) fail('LIMIT', 'too many chunks');
  const out: ChunkRef[] = [];
  let end = 0;
  for (let i = 0; i < n; i++) {
    const offset = end + r.sv();
    const len = r.uv();
    end = offset + len;
    const rawLen = r.uv();
    if (offset < dataStart || end > dataEnd) fail('CORRUPT', 'chunk outside the data area');
    if (rawLen > LIMITS.maxChunkRaw) fail('LIMIT', 'chunk too large');
    const codec = r.u8();
    const lane = r.u8();
    const count = r.uv();
    if (count > LIMITS.maxEvents) fail('LIMIT', 'too many events in a chunk');
    const minStartMs = r.sv();
    const maxEndMs = minStartMs + r.uv();
    const minLine = r.sv();
    const maxLine = minLine + r.uv();
    out.push({ offset, len, rawLen, codec, lane, count, minStartMs, maxEndMs, minLine, maxLine, crc: r.u32() });
  }
  return out;
};
