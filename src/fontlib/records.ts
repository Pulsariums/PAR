import { contentKey, type ParsedFace } from '../fonts/loader';
import { countAll } from '../fonts/coverage';
import { normalizeName } from '../fonts/resolver';

import { scriptBadges } from './badges';
import { RECORD_VERSION, type FontRecord } from './types';

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Lower-case lookup keys: family, every family name, full / PostScript names and aliases; no `@`, no duplicates. */
export const keysOf = (r: Pick<FontRecord, 'family' | 'families' | 'fullNames' | 'aliases'>): string[] =>
  [...new Set([r.family, ...r.families, ...r.fullNames, ...r.aliases].map(normalizeName).filter(Boolean))];

/** SHA-256 of the bytes (first 128 bits, hex). Falls back to PAR's content hash where `crypto.subtle` is missing. */
export const hashBytes = async (data: Uint8Array): Promise<string> => {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) return `k${contentKey(data)}`;
  const d = new Uint8Array(await subtle.digest('SHA-256', data as BufferSource));
  return Array.from(d.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
};

export const recordOf = (id: string, p: ParsedFace, at: number): FontRecord => {
  const base = { family: p.info.family, families: [...p.info.families], fullNames: [...p.info.fullNames], aliases: [] as string[] };
  return {
    id, v: RECORD_VERSION, file: p.label, ...base, keys: keysOf(base), weight: p.info.weight, italic: p.info.italic, size: p.data.byteLength,
    addedAt: at, scripts: scriptBadges(p.info.coverage), glyphs: p.info.coverage ? countAll(p.info.coverage) : 0,
  };
};

/**
 * Reads whatever is stored into a valid `FontRecord`, or null when the entry is unusable (wrong type, no id / family).
 * Older or partial entries are filled in (missing aliases, keys, counters), never trusted blindly.
 */
export const normalizeRecord = (raw: unknown): FontRecord | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id || typeof r.family !== 'string' || !r.family) return null;
  const base = { family: r.family, families: strings(r.families), fullNames: strings(r.fullNames), aliases: strings(r.aliases) };
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    id: r.id, v: RECORD_VERSION, file: typeof r.file === 'string' ? r.file : r.family, ...base, keys: keysOf(base),
    weight: num(r.weight, 400), italic: r.italic === true, size: num(r.size, 0), addedAt: num(r.addedAt, 0),
    scripts: strings(r.scripts), glyphs: num(r.glyphs, 0),
  };
};

/** Does the stored entry already have the current layout (no rewrite needed)? */
export const isCurrent = (raw: unknown): boolean => {
  const r = raw as Partial<FontRecord> | null;
  return !!r && r.v === RECORD_VERSION && Array.isArray(r.keys) && Array.isArray(r.aliases) && Array.isArray(r.scripts);
};

/** Best face of `list` for a request: slope first, then the closest weight (the resolver's own rule). */
export const bestFace = (list: readonly FontRecord[], weight: number, italic: boolean): FontRecord | null =>
  [...list].sort((a, b) => cost(a, weight, italic) - cost(b, weight, italic) || a.id.localeCompare(b.id))[0] ?? null;

const cost = (f: FontRecord, weight: number, italic: boolean): number => (f.italic === italic ? 0 : 10000) + Math.abs(f.weight - weight);

/** Stored bytes as a Uint8Array (checked by tag, not `instanceof`: values may come from another realm), or null when damaged. */
export const asBytes = (v: unknown): Uint8Array | null => {
  const d = v && typeof v === 'object' ? (v as { data?: unknown }).data : null;
  if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
  if (Object.prototype.toString.call(d) === '[object ArrayBuffer]') return new Uint8Array(d as ArrayBuffer);
  return null;
};
