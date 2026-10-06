import type { FontProvider } from '../fonts/provider';

/** One stored face (metadata only: the bytes live in their own store and load lazily). */
export interface FontRecord {
  /** Content id: SHA-256 (first 128 bits, hex) of the stored bytes, so identical fonts are stored once. */
  id: string;
  /** Record layout version (see `RECORD_VERSION`). */
  v: number;
  /** File name the face came from. */
  file: string;
  family: string;
  /** Every family name in the file, original case. */
  families: string[];
  /** Full and PostScript names from the file. */
  fullNames: string[];
  /** Names the user added (a script may call the font by them). */
  aliases: string[];
  /** Lower-case lookup keys (family, families, full / PostScript names, aliases; no `@`): the multiEntry index. */
  keys: string[];
  weight: number;
  italic: boolean;
  /** Stored size in bytes. */
  size: number;
  addedAt: number;
  /** Script ids the font covers completely (see `SCRIPTS`), computed from its cmap when added. */
  scripts: string[];
  /** Number of mapped code points (0 when the font has no readable cmap). */
  glyphs: number;
}

export const RECORD_VERSION = 1;

export interface AddResult {
  added: FontRecord[];
  /** Faces that were already in the library (same content): nothing was stored again. */
  duplicates: FontRecord[];
  errors: Array<{ name: string; error: string }>;
}

export interface LibraryUsage {
  count: number;
  /** Bytes of fonts stored by this library. */
  bytes: number;
  /** Origin-wide numbers from `navigator.storage.estimate()`, null when unavailable. */
  used: number | null;
  quota: number | null;
  /** used / quota, null when unknown. */
  ratio: number | null;
  /** True at 80 % of the quota or more: warn before the next big upload. */
  warn: boolean;
  /** Result of `navigator.storage.persisted()`, null when unavailable. */
  persisted: boolean | null;
}

export interface RepairResult {
  /** Metadata entries removed because they were unreadable or had no usable bytes. */
  brokenRecords: number;
  /** Byte entries removed because no metadata pointed at them. */
  orphanBytes: number;
}

export interface LibraryOptions {
  /** IndexedDB factory (default: global `indexedDB`). */
  factory?: IDBFactory;
  /** Storage manager (default: `navigator.storage`). */
  storage?: StorageManagerLike | null;
}

/** The part of `navigator.storage` the library uses. */
export interface StorageManagerLike {
  estimate?(): Promise<{ usage?: number; quota?: number }>;
  persist?(): Promise<boolean>;
  persisted?(): Promise<boolean>;
}

export type { FontProvider };

export class FontLibraryError extends Error {
  constructor(readonly code: 'unsupported' | 'newer-schema' | 'blocked' | 'quota' | 'closed', message: string) {
    super(message);
    this.name = 'FontLibraryError';
  }
}
