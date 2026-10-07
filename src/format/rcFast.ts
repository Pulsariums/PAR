import { fail } from './errors';
import { decodeHead, readLayout, rcDecode, rcEncode } from './rc';
import { wasmDecode, wasmEncode } from '../wasm/rcWasm';

/**
 * The block coder with WebAssembly when it is available (src/wasm, rust/par-wasm), else the TypeScript coder in rc.ts.
 * Both produce identical bytes; the choice is invisible to callers and to the file format.
 */
export const rcEncodeFast = async (raw: Uint8Array): Promise<Uint8Array> => {
  const lay = readLayout(raw);
  const body = await wasmEncode(raw, lay.head, lay.keys, lay.lens);
  if (!body) return rcEncode(raw);
  const out = new Uint8Array(lay.head + body.length);
  out.set(raw.subarray(0, lay.head));
  out.set(body, lay.head);
  return out;
};

export const rcDecodeFast = async (data: Uint8Array, rawLen: number): Promise<Uint8Array> => {
  const { keys, lens, head } = decodeHead(data, rawLen);
  const out = await wasmDecode(data, rawLen, head, keys, lens);
  if (out === 'corrupt') return fail('CORRUPT', 'numeric stream overruns its length');
  return out ?? rcDecode(data, rawLen);
};
