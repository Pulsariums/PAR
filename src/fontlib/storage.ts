import type { LibraryUsage, StorageManagerLike } from './types';

export const defaultStorage = (): StorageManagerLike | null =>
  (typeof navigator !== 'undefined' ? (navigator as { storage?: StorageManagerLike }).storage : undefined) ?? null;

/** At this share of the quota (or more) `usage().warn` is true. */
export const WARN_RATIO = 0.8;

export const usageOf = async (count: number, bytes: number, st: StorageManagerLike | null): Promise<LibraryUsage> => {
  let est: { usage?: number; quota?: number } | null = null;
  let persisted: boolean | null = null;
  try { est = (await st?.estimate?.()) ?? null; } catch { est = null; }
  try { persisted = (await st?.persisted?.()) ?? null; } catch { persisted = null; }
  const used = typeof est?.usage === 'number' ? est.usage : null;
  const quota = typeof est?.quota === 'number' && est.quota > 0 ? est.quota : null;
  const ratio = used !== null && quota !== null ? used / quota : null;
  return { count, bytes, used, quota, ratio, warn: ratio !== null && ratio >= WARN_RATIO, persisted };
};

/** Asks the browser not to evict the library under storage pressure. false when unsupported, refused or failed. */
export const requestPersistence = async (st: StorageManagerLike | null): Promise<boolean> => {
  try { return (await st?.persist?.()) === true; } catch { return false; }
};

/** Free space as far as the browser tells (null = unknown). */
export const freeBytes = async (st: StorageManagerLike | null): Promise<number | null> => {
  try {
    const e = await st?.estimate?.();
    return typeof e?.quota === 'number' && typeof e.usage === 'number' ? Math.max(0, e.quota - e.usage) : null;
  } catch { return null; }
};
