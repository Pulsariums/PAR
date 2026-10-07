import { SQUASH, STRETCH } from '../format/rcTables';

import { drop, kernels, settle, type Kernels } from './load';

/**
 * Memory map of one job (all offsets from `heapBase`, 16-aligned):
 *   [stretch 16 KiB][squash 16 KiB][mixer weights 32 KiB][job record][keys][lens][tables 3 x 2^bits u16][input][output]
 * The tables are written once per instance; the rest per call.
 */
const FIXED = 65536;
const JOB_WORDS = 13;
const up = (n: number): number => (n + 15) & ~15;

/** Keys feed 32-bit hashes in the coder; absurd ones (corrupt files) go to the TypeScript path, which handles them exactly. */
export const keysOk = (keys: readonly number[]): boolean => keys.every((k) => k < 1 << 30);

const prepare = (k: Kernels, need: number): number => {
  const have = k.memory.buffer.byteLength;
  const end = k.heapBase + FIXED + need;
  if (end > have) k.memory.grow(Math.ceil((end - have) / 65536));
  const base = k.heapBase;
  const m32 = new Uint32Array(k.memory.buffer, base, 8192);
  if (m32[0] === 0 && m32[1] === 0) {
    new Float32Array(k.memory.buffer, base, 4096).set(STRETCH);
    new Float32Array(k.memory.buffer, base + 16384, 4096).set(SQUASH);
  }
  return base;
};

const tableBits = (rawLen: number): number => Math.min(22, Math.max(12, Math.ceil(Math.log2(rawLen + 1)) + 1));

interface Plan { base: number; job: number; keys: number; lens: number; tables: number; input: number; out: number; end: number; bits: number }

const plan = (base: number, n: number, rawLen: number, inLen: number, outCap: number): Plan => {
  const bits = tableBits(rawLen);
  const job = base + FIXED;
  const keys = up(job + JOB_WORDS * 4);
  const lens = up(keys + n * 4);
  const tables = up(lens + n * 4);
  const input = up(tables + 3 * 2 * (1 << bits));
  const out = up(input + inLen);
  return { base, job, keys, lens, tables, input, out, end: out + outCap, bits };
};

const run = (k: Kernels, p: Plan, keys: readonly number[], lens: readonly number[], data: Uint8Array, head: number, outCap: number, fn: (job: number) => number): number => {
  const buf = k.memory.buffer;
  new Uint32Array(buf, p.keys, keys.length).set(keys);
  new Uint32Array(buf, p.lens, lens.length).set(lens);
  new Uint8Array(buf, p.input, data.length).set(data);
  new Uint32Array(buf, p.job, JOB_WORDS).set([p.tables, p.bits, p.base, p.base + 16384, p.base + 32768, p.input, data.length, head, p.keys, p.lens, keys.length, p.out, outCap]);
  return fn(p.job);
};

/** Body bytes of the coded block (without the stream table), or null if WebAssembly is unavailable. `raw` includes the table (`head` bytes). */
export const wasmEncode = async (raw: Uint8Array, head: number, keys: number[], lens: number[]): Promise<Uint8Array | null> => {
  const k = await kernels();
  if (!k || !keysOk(keys)) return null;
  try {
    return encodeWith(k, raw, head, keys, lens);
  } catch {
    drop();
    return null;
  }
};

const encodeWith = (k: Kernels, raw: Uint8Array, head: number, keys: number[], lens: number[]): Uint8Array => {
  let cap = raw.length + (raw.length >> 1) + 1024;
  for (;;) {
    const p0 = plan(k.heapBase, keys.length, raw.length, raw.length, cap);
    prepare(k, p0.end - k.heapBase - FIXED);
    const n = run(k, p0, keys, lens, raw, head, cap, k.rc_encode);
    if (n >= 0) {
      const body = new Uint8Array(k.memory.buffer, p0.out, n).slice();
      settle();
      return body;
    }
    cap *= 2;
  }
};

/** Decoded block (table + streams), 'corrupt' when a numeric stream overruns, null if WebAssembly is unavailable. */
export const wasmDecode = async (data: Uint8Array, rawLen: number, head: number, keys: number[], lens: number[]): Promise<Uint8Array | 'corrupt' | null> => {
  const k = await kernels();
  if (!k || !keysOk(keys)) return null;
  try {
    return decodeWith(k, data, rawLen, head, keys, lens);
  } catch {
    drop();
    return null;
  }
};

const decodeWith = (k: Kernels, data: Uint8Array, rawLen: number, head: number, keys: number[], lens: number[]): Uint8Array | 'corrupt' => {
  const p = plan(k.heapBase, keys.length, rawLen, data.length, rawLen);
  prepare(k, p.end - k.heapBase - FIXED);
  const st = run(k, p, keys, lens, data, head, rawLen, k.rc_decode);
  let out: Uint8Array | 'corrupt' = 'corrupt';
  if (st === 0) {
    out = new Uint8Array(rawLen);
    out.set(data.subarray(0, head));
    out.set(new Uint8Array(k.memory.buffer, p.out + head, rawLen - head), head);
  }
  settle();
  return out;
};
