import { isZip, readZip } from './zip';
import type { FontInput } from './types';

export const FONT_EXT = /\.(ttf|otf|ttc|otc|woff2?)$/i;

export interface NamedBytes {
  /** File name or URL (used as label, and as family fallback). */
  name: string;
  data: Uint8Array;
}

const nameOf = (x: unknown, fallback: string): string => (x && typeof x === 'object' && 'name' in x && typeof (x as { name: unknown }).name === 'string' ? (x as { name: string }).name : fallback);

/** Reads any `FontInput` into bytes. Strings and URLs are fetched (CORS applies). */
export const readInput = async (input: FontInput): Promise<NamedBytes> => {
  if (typeof input === 'string' || input instanceof URL) {
    const url = String(input);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
    return { name: url.split(/[?#]/)[0].split('/').pop() || url, data: new Uint8Array(await res.arrayBuffer()) };
  }
  if (input instanceof ArrayBuffer) return { name: '', data: new Uint8Array(input) };
  if (ArrayBuffer.isView(input)) return { name: '', data: new Uint8Array(input.buffer, input.byteOffset, input.byteLength) };
  const blob = input as Blob;
  const data = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : await new Response(blob).arrayBuffer();
  return { name: nameOf(input, ''), data: new Uint8Array(data) };
};

/** Like `readInput`, but a ZIP archive expands into its font files. */
export const readInputs = async (input: FontInput): Promise<NamedBytes[]> => {
  const one = await readInput(input);
  if (!isZip(one.data)) return [one];
  const entries = await readZip(one.data, (n) => FONT_EXT.test(n));
  return entries.map((e) => ({ name: e.name.split('/').pop() ?? e.name, data: e.data }));
};
