import { decodeXpar, encodeXpar, openXpar, type EncodeOptions } from '../src/format';
import { generateText } from '../tools/xpar/bench-all';

export const te = new TextEncoder();
export const SMALL: EncodeOptions = { chunkBytes: 8 * 1024, minChunkBytes: 1024, chunkMs: 300 };

export const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

export const roundTrip = async (input: Uint8Array, opts: EncodeOptions = {}): Promise<{ ok: boolean; xpar: Uint8Array }> => {
  const xpar = await encodeXpar(input, opts);
  const back = await decodeXpar(await openXpar(xpar));
  return { ok: same(back, input), xpar };
};

export const PROFILE_SECONDS: Record<string, number> = { 'a-text-60': 1, 'a-text-24': 2, 'b-draw-24': 3, 'c-episode': 600 };
export const profileText = (id: string): string => generateText(id, PROFILE_SECONDS[id]);
