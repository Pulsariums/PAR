import type { FontLibrary } from './FontLibrary';
import { zipStore, type ZipFile } from './zipWrite';

const ext = (d: Uint8Array): string => {
  const sig = String.fromCharCode(...d.subarray(0, 4));
  return sig === 'wOFF' ? 'woff' : sig === 'wOF2' ? 'woff2' : sig === 'OTTO' ? 'otf' : 'ttf';
};

const safe = (s: string): string => s.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 60) || 'font';

/** The library (or some ids) as an uncompressed .zip: one file per face plus `manifest.json` (aliases, weights, ids). */
export const exportLibrary = async (lib: FontLibrary, ids?: readonly string[]): Promise<Blob> => {
  const want = ids ? new Set(ids) : null;
  const files: ZipFile[] = [];
  const manifest: unknown[] = [];
  for (const rec of await lib.list()) {
    if (want && !want.has(rec.id)) continue;
    const data = await lib.bytes(rec.id);
    if (!data) continue;
    const file = `${safe(rec.family)}-${rec.weight}${rec.italic ? 'i' : ''}-${rec.id.slice(0, 6)}.${ext(data)}`;
    files.push({ name: file, data });
    manifest.push({ file, id: rec.id, family: rec.family, aliases: rec.aliases, weight: rec.weight, italic: rec.italic, original: rec.file });
  }
  files.push({ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify({ fonts: manifest }, null, 2)) });
  return new Blob([zipStore(files)], { type: 'application/zip' });
};
