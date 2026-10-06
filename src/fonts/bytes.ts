/** Big-endian readers (out of range => 0) and text decoders for the SFNT `name` table. */

export const u16 = (b: Uint8Array, o: number): number => (o >= 0 && o + 2 <= b.length ? (b[o] << 8) | b[o + 1] : 0);
export const i16 = (b: Uint8Array, o: number): number => (u16(b, o) << 16) >> 16;
export const u32 = (b: Uint8Array, o: number): number => (o >= 0 && o + 4 <= b.length ? b[o] * 0x1000000 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) : 0);
export const tag = (b: Uint8Array, o: number): string => (o >= 0 && o + 4 <= b.length ? String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]) : '');

export const utf16be = (b: Uint8Array, o: number, len: number): string => {
  let s = '';
  for (let i = 0; i + 1 < len; i += 2) s += String.fromCharCode(u16(b, o + i));
  return s;
};

/** MacRoman 0x80..0xFF. */
const MAC_HIGH = 'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';

export const macRoman = (b: Uint8Array, o: number, len: number): string => {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = b[o + i];
    s += c < 0x80 ? String.fromCharCode(c) : MAC_HIGH[c - 0x80] ?? '';
  }
  return s;
};

type Format = 'deflate' | 'deflate-raw' | 'brotli';
export type Inflater = (data: Uint8Array, format: Format) => Promise<Uint8Array>;

/** Native decompression (`DecompressionStream`); throws when the runtime lacks the format. */
export const inflate: Inflater = async (data, format) => {
  const DS = (globalThis as { DecompressionStream?: new (f: string) => GenericTransformStream }).DecompressionStream;
  if (!DS) throw new Error('DecompressionStream is not available');
  const src = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(data); c.close(); } });
  const reader = src.pipeThrough(new DS(format) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    chunks.push(r.value);
    total += r.value.length;
  }
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
};
