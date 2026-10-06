import { fail } from './errors';
import type { Sink } from './writer';

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

export const collect = (): { sink: Sink; result: () => Uint8Array } => {
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
