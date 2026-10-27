/**
 * MKV is not a container browsers play in <video> everywhere (Firefox and Safari refuse it). The file is remuxed in the browser
 * with mediabunny: H.264 / AAC (and other copyable tracks) are copied packet by packet, anything else is transcoded with WebCodecs.
 * The library is loaded from a CDN on first use, so the page needs no build step for it.
 */
const MEDIABUNNY_URL = 'https://cdn.jsdelivr.net/npm/mediabunny@1.61.4/dist/bundles/mediabunny.min.mjs';

interface Mediabunny {
  Input: new (o: { source: unknown; formats: unknown[] }) => { dispose(): void };
  BlobSource: new (b: Blob) => unknown;
  BufferTarget: new () => { buffer: ArrayBuffer | null };
  Output: new (o: { format: unknown; target: unknown }) => unknown;
  Mp4OutputFormat: new (o: { fastStart: 'in-memory' }) => unknown;
  MATROSKA: unknown;
  Conversion: {
    init(o: { input: unknown; output: unknown; showWarnings: boolean }): Promise<{
      isValid: boolean;
      onProgress?: (progress: number) => unknown;
      execute(): Promise<void>;
    }>;
  };
}

let lib: Promise<Mediabunny> | null = null;
const load = (): Promise<Mediabunny> => {
  lib ??= (import(/* @vite-ignore */ MEDIABUNNY_URL) as Promise<Mediabunny>).catch((e: unknown) => {
    lib = null;
    throw e;
  });
  return lib;
};

export const isMkv = (f: File): boolean => /\.mkv$/i.test(f.name) || f.type === 'video/x-matroska';

/** Remuxes an MKV file to an MP4 blob (moov box first, so seeking works in every browser). Reports progress from 0 to 1. */
export const remuxMkv = async (file: File, onProgress: (p: number) => void): Promise<Blob> => {
  const mb = await load();
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: [mb.MATROSKA] });
  try {
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    const conversion = await mb.Conversion.init({ input, output, showWarnings: false });
    if (!conversion.isValid) throw new Error('no playable tracks in this MKV');
    conversion.onProgress = (p) => onProgress(p);
    await conversion.execute();
    if (!target.buffer) throw new Error('remux produced no data');
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    input.dispose();
  }
};
