import { inflate, type Inflater } from './bytes';
import type { NamedBytes } from './input';
import { readFaces, type RawFace } from './sfnt';
import { readFaceInfo } from './sfntInfo';
import type { FaceInfo } from './types';

export interface ParsedFace {
  /** Content hash + face index: identical bytes always give the same key. */
  key: string;
  /** Bytes to hand to the browser (a TTC member is extracted to a standalone font). */
  data: Uint8Array;
  info: FaceInfo;
  label: string;
  /** Set when the file loads but its tables could not be read (e.g. WOFF2 without Brotli). */
  degraded?: string;
}

/** 2x FNV-1a (32 bit, different bases) + length: a cheap content id, not a cryptographic hash. */
export const contentKey = (data: Uint8Array): string => {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < data.length; i++) {
    a = Math.imul(a ^ data[i], 0x01000193);
    b = Math.imul(b ^ data[i], 0x85ebca6b);
  }
  return `${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}-${data.length.toString(16)}`;
};

/** `Arial_0.ttf` / `Roboto-Bold.woff2` => `Arial` / `Roboto-Bold`: last-resort family when a file has no name table. */
export const familyFromFileName = (name: string): string =>
  name.replace(/^.*[\\/]/, '').replace(/\.(ttf|otf|ttc|otc|woff2?)$/i, '').replace(/_\d+$/, '').trim();

const emptyInfo = (family: string): FaceInfo => ({ family, families: family ? [family] : [], fullNames: [], weight: 400, italic: false, boldFlag: false, metrics: null, coverage: null });

/**
 * Parses a font file into registrable faces (one per TTC member). `family` overrides the detected name.
 * Throws when the bytes are not a font at all.
 */
export const parseFont = async (file: NamedBytes, family?: string, inf: Inflater = inflate): Promise<ParsedFace[]> => {
  const key = contentKey(file.data);
  const sig = String.fromCharCode(...file.data.subarray(0, 4));
  let raw: RawFace[];
  let degraded: string | undefined;
  try {
    raw = await readFaces(file.data, inf);
  } catch (e) {
    if (sig !== 'wOF2' && sig !== 'wOFF') throw e;
    degraded = `font tables unreadable (${e instanceof Error ? e.message : String(e)}); family taken from the file name`;
    raw = [{ tables: new Map() }];
  }
  if (raw.length === 0) throw new Error(`${file.name || 'data'}: not a TTF/OTF/TTC/WOFF/WOFF2 font`);
  return raw.map((r, i) => {
    const info = readFaceInfo(r);
    const name = family?.trim() || info.family || familyFromFileName(file.name);
    const merged: FaceInfo = { ...info, family: name, families: [...new Set([name, ...info.families])] };
    return { key: `${key}#${i}`, data: r.standalone ?? file.data, info: info.family || family ? merged : { ...emptyInfo(name), ...merged }, label: file.name || name, degraded };
  });
};

/** Parses several files, collecting per-file failures through `warn` instead of throwing. */
export const parseAll = async (
  files: ReadonlyArray<{ name: string; data: Uint8Array }>,
  what: string,
  warn: (m: string) => void,
  inf: Inflater = inflate,
): Promise<ParsedFace[]> => {
  const out: ParsedFace[] = [];
  for (const f of files) {
    try { out.push(...(await parseFont(f, undefined, inf))); } catch (e) { warn(`${what} ${f.name}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return out;
};
