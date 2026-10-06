import { ByteReader, ByteWriter } from './bytes';
import { fail, LIMITS } from './errors';
import { Decoder, Encoder } from './rcCore';
import { SymbolCoder } from './rcSym';

/**
 * ASS-stream entropy coder. A block is a set of streams (streams.ts). Every stream is coded with a context made of
 * its key (field kind, tag id, argument index) and the previous values of that stream; numeric streams are coded
 * as numbers (zero flag, bit length, mantissa), the string stream as bytes. Context-mixed adaptive binary range coder.
 */
const KEY_STR = 4;

interface Layout {
  keys: number[];
  lens: number[];
  head: number;
}

const readTable = (r: ByteReader): { keys: number[]; lens: number[]; total: number } => {
  const n = r.uv();
  if (n > LIMITS.maxStreams) fail('LIMIT', 'too many streams in a block');
  const keys: number[] = [];
  const lens: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    keys.push(r.uv());
    const l = r.uv();
    lens.push(l);
    total += l;
  }
  return { keys, lens, total };
};

const readLayout = (raw: Uint8Array): Layout => {
  const r = new ByteReader(raw);
  const t = readTable(r);
  if (t.total !== r.left) fail('CORRUPT', 'stream table does not match the block size');
  return { keys: t.keys, lens: t.lens, head: r.pos };
};

/** Values of a stream when it is made only of canonical LEB128 numbers, else null (coded as bytes). */
const asNumbers = (b: Uint8Array): number[] | null => {
  const out: number[] = [];
  let v = 0;
  let mul = 1;
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    v += (c & 127) * mul;
    n++;
    if (c < 128) {
      if (c === 0 && n > 1) return null; // padded varint: not canonical
      if (n > 7 || v > Number.MAX_SAFE_INTEGER) return null;
      out.push(v);
      v = 0;
      mul = 1;
      n = 0;
    } else mul *= 128;
  }
  return n === 0 ? out : null;
};

const varintLen = (v: number): number => {
  let n = 1;
  while (v >= 128) {
    v = Math.floor(v / 128);
    n++;
  }
  return n;
};

export const rcEncode = (raw: Uint8Array): Uint8Array => {
  const lay = readLayout(raw);
  const e = new Encoder();
  const sc = new SymbolCoder(raw.length, e, null);
  let pos = lay.head;
  lay.keys.forEach((key, s) => {
    const body = raw.subarray(pos, pos + lay.lens[s]);
    pos += lay.lens[s];
    const nums = key === KEY_STR ? null : asNumbers(body);
    sc.begin(key);
    sc.flag(nums ? 1 : 0);
    if (nums) for (const v of nums) sc.num(v);
    else for (const c of body) sc.byte(c);
  });
  const body = e.finish();
  const out = new Uint8Array(lay.head + body.length);
  out.set(raw.subarray(0, lay.head));
  out.set(body, lay.head);
  return out;
};

export const rcDecode = (data: Uint8Array, rawLen: number): Uint8Array => {
  if (rawLen > LIMITS.maxChunkRaw) fail('LIMIT', 'block too large');
  const r = new ByteReader(data);
  const t = readTable(r);
  const head = r.pos;
  if (head + t.total !== rawLen) fail('CORRUPT', 'stream table does not match the declared size');
  const out = new Uint8Array(rawLen);
  out.set(data.subarray(0, head));
  const sc = new SymbolCoder(rawLen, null, new Decoder(data, head));
  const w = new ByteWriter(16);
  let pos = head;
  t.keys.forEach((key, s) => {
    const end = pos + t.lens[s];
    sc.begin(key);
    if (sc.flag(0)) {
      while (pos < end) {
        const v = sc.num(0);
        const l = varintLen(v);
        if (pos + l > end) fail('CORRUPT', 'numeric stream overruns its length');
        w.len = 0;
        w.uv(v);
        out.set(w.view(), pos);
        pos += l;
      }
    } else while (pos < end) out[pos++] = sc.byte(0);
  });
  return out;
};

/** Flat bytes (meta/index blocks): one byte stream, key 0. */
export const rcEncodeFlat = (raw: Uint8Array): Uint8Array => {
  const e = new Encoder();
  const sc = new SymbolCoder(raw.length, e, null);
  sc.begin(0);
  for (const c of raw) sc.byte(c);
  return e.finish().slice();
};

export const rcDecodeFlat = (data: Uint8Array, rawLen: number): Uint8Array => {
  if (rawLen > LIMITS.maxMetaRaw) fail('LIMIT', 'block too large');
  const out = new Uint8Array(rawLen);
  const sc = new SymbolCoder(rawLen, null, new Decoder(data, 0));
  sc.begin(0);
  for (let k = 0; k < rawLen; k++) out[k] = sc.byte(0);
  return out;
};
