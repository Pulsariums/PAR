import { FontLibraryError } from './types';

export const META = 'meta';
export const BYTES = 'bytes';

/** Schema steps. Step i upgrades a database from version i to i + 1; append new steps, never edit old ones. */
const MIGRATIONS: Array<(db: IDBDatabase, tx: IDBTransaction) => void> = [
  // v1: metadata (indexed by lookup key) and bytes in separate stores, so listing never reads font data
  (db) => {
    const meta = db.createObjectStore(META, { keyPath: 'id' });
    meta.createIndex('keys', 'keys', { multiEntry: true });
    db.createObjectStore(BYTES, { keyPath: 'id' });
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export const request = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

/** Resolves when the transaction committed; rejects on abort / error (quota errors included). */
export const committed = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });

export const openDb = (factory: IDBFactory | undefined, name: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (!factory) { reject(new FontLibraryError('unsupported', 'IndexedDB is not available in this environment')); return; }
    const req = factory.open(name, SCHEMA_VERSION);
    req.onupgradeneeded = (e) => {
      for (let v = e.oldVersion; v < SCHEMA_VERSION; v++) MIGRATIONS[v](req.result, req.transaction!);
    };
    req.onblocked = () => reject(new FontLibraryError('blocked', 'another tab holds an older version of the font library open'));
    req.onerror = () => {
      const err = req.error;
      reject(err?.name === 'VersionError' ? new FontLibraryError('newer-schema', `"${name}" was written by a newer PAR version; update PAR`) : err);
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
  });

export const isQuotaError = (e: unknown): boolean => !!e && typeof e === 'object' && (e as { name?: string }).name === 'QuotaExceededError';
