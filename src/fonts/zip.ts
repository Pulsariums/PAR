import { inflate, type Inflater } from './bytes';

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const MAX_ENTRY = 64 * 1024 * 1024;

const le16 = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8);
const le32 = (b: Uint8Array, o: number): number => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000;

export const isZip = (b: Uint8Array): boolean => b.length > 22 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5);

/**
 * Minimal ZIP reader: central directory, stored (0) and deflate (8, via native `DecompressionStream('deflate-raw')`).
 * No encryption, no ZIP64, no multi-disk. Entries whose `accept(name)` is false are not decompressed.
 */
export const readZip = async (b: Uint8Array, accept: (name: string) => boolean, inf: Inflater = inflate): Promise<ZipEntry[]> => {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (le32(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a valid zip (no end-of-central-directory record)');
  const count = le16(b, eocd + 10);
  let p = le32(b, eocd + 16);
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (le32(b, p) !== 0x02014b50) break;
    const [method, comp, size, nameLen, extraLen, commentLen, local] = [le16(b, p + 10), le32(b, p + 20), le32(b, p + 24), le16(b, p + 28), le16(b, p + 30), le16(b, p + 32), le32(b, p + 42)];
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/') || !accept(name) || size > MAX_ENTRY) continue;
    const start = local + 30 + le16(b, local + 26) + le16(b, local + 28);
    const raw = b.subarray(start, start + comp);
    if (method === 0) out.push({ name, data: raw });
    else if (method === 8) out.push({ name, data: await inf(raw, 'deflate-raw') });
    else throw new Error(`unsupported zip compression method ${method} in ${name}`);
  }
  return out;
};
