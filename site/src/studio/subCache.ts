import type { SubtitleSource } from '../../../src/source';

import type { StudioSession } from './session';

/** Keep the browser manifest small and never put subtitle bytes or parsed events in storage. */
export const SUBTITLE_MANIFEST_KEY = 'par.studio.subtitle-cache.v1';
export const MAX_RUNTIME_ENTRIES = 3;
export const MAX_MANIFEST_ENTRIES = 12;
export const MAX_MANIFEST_BYTES = 16 * 1024;

export interface SubtitleIdentity {
  /** Stable for this File object during the current tab session. */
  key: string;
  name: string;
  size: number;
  modified: number;
  kind: StudioSession['kind'];
}

export interface SubtitleManifestEntry {
  key: string;
  name: string;
  size: number;
  modified: number;
  kind: StudioSession['kind'];
  lastUsed: number;
  duration?: number;
  eventCount?: number;
}

interface RuntimeEntry {
  identity: SubtitleIdentity;
  session: StudioSession;
}

interface StoredManifest {
  version: 1;
  entries: SubtitleManifestEntry[];
}

const storage = (): Storage | null => {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
};

const validKind = (kind: unknown): kind is StudioSession['kind'] => kind === 'ass' || kind === 'xpar' || kind === 'par';
const finiteNonNegative = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

const readManifest = (): SubtitleManifestEntry[] => {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(SUBTITLE_MANIFEST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoredManifest>;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return [];
    return parsed.entries.filter((entry): entry is SubtitleManifestEntry => !!entry && typeof entry.key === 'string' && typeof entry.name === 'string' && finiteNonNegative(entry.size) && finiteNonNegative(entry.modified) && validKind(entry.kind) && finiteNonNegative(entry.lastUsed) && (entry.duration === undefined || finiteNonNegative(entry.duration)) && (entry.eventCount === undefined || finiteNonNegative(entry.eventCount))).slice(0, MAX_MANIFEST_ENTRIES);
  } catch { return []; }
};

const writeManifest = (entries: readonly SubtitleManifestEntry[]): void => {
  const store = storage();
  if (!store) return;
  try {
    const keep = entries.slice(0, MAX_MANIFEST_ENTRIES);
    let raw = JSON.stringify({ version: 1, entries: keep } satisfies StoredManifest);
    while (raw.length > MAX_MANIFEST_BYTES && keep.length) {
      keep.pop();
      raw = JSON.stringify({ version: 1, entries: keep } satisfies StoredManifest);
    }
    store.setItem(SUBTITLE_MANIFEST_KEY, raw);
  } catch { /* sessionStorage can be disabled or full; the runtime cache still works. */ }
};

const touch = (entry: SubtitleManifestEntry, session: StudioSession): SubtitleManifestEntry => ({
  ...entry,
  name: session.name,
  size: session.blob.size,
  duration: session.source.duration,
  eventCount: session.source.eventCount,
  lastUsed: Date.now(),
});

/** Identity and manifest cache for Studio subtitle openings. Runtime entries own sources; storage only owns metadata. */
export class SubtitleCache {
  private readonly runtime = new Map<string, RuntimeEntry>();
  private manifest = readManifest();

  identity(file: File, kind: StudioSession['kind']): SubtitleIdentity {
    const name = file.name || 'subtitle';
    const size = Number.isFinite(file.size) ? file.size : 0;
    const modified = Number.isFinite(file.lastModified) ? file.lastModified : 0;
    return { key: `${kind}:${name}:${size}:${modified}`, name, size, modified, kind };
  }

  get(identity: SubtitleIdentity): StudioSession | null {
    const entry = this.runtime.get(identity.key);
    if (!entry) return null;
    this.runtime.delete(identity.key);
    this.runtime.set(identity.key, entry);
    this.remember(identity, entry.session);
    return entry.session;
  }

  set(identity: SubtitleIdentity, session: StudioSession): void {
    const old = this.runtime.get(identity.key);
    if (old && old.session !== session) old.session.source.close?.();
    this.runtime.delete(identity.key);
    this.runtime.set(identity.key, { identity, session });
    while (this.runtime.size > MAX_RUNTIME_ENTRIES) {
      const oldest = this.runtime.keys().next().value as string | undefined;
      if (!oldest) break;
      const gone = this.runtime.get(oldest);
      this.runtime.delete(oldest);
      if (gone) gone.session.source.close?.();
    }
    this.remember(identity, session);
  }

  delete(identity: SubtitleIdentity): void {
    const entry = this.runtime.get(identity.key);
    this.runtime.delete(identity.key);
    entry?.session.source.close?.();
    this.manifest = this.manifest.filter((item) => item.key !== identity.key);
    writeManifest(this.manifest);
  }

  manifestEntries(): readonly SubtitleManifestEntry[] { return this.manifest; }

  clear(): void {
    for (const entry of this.runtime.values()) entry.session.source.close?.();
    this.runtime.clear();
  }

  private remember(identity: SubtitleIdentity, session: StudioSession): void {
    const base: SubtitleManifestEntry = this.manifest.find((entry) => entry.key === identity.key) ?? { ...identity, lastUsed: 0 };
    const next = touch(base, session);
    this.manifest = [next, ...this.manifest.filter((entry) => entry.key !== identity.key)].slice(0, MAX_MANIFEST_ENTRIES);
    writeManifest(this.manifest);
  }
}

export interface IdleHandle { cancel(): void }

/** Schedules one small source hint without competing with first paint or playback work. */
export const scheduleSubtitlePrewarm = (source: SubtitleSource, from: () => number, length = 2): IdleHandle => {
  let cancelled = false;
  let idle: number | ReturnType<typeof setTimeout> | null = null;
  const run = (): void => {
    idle = null;
    if (cancelled) return;
    const t0 = Math.max(0, from());
    if (Number.isFinite(t0)) source.prefetch?.(t0, t0 + Math.max(0.25, length));
  };
  const win = typeof window === 'undefined' ? undefined : window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (win?.requestIdleCallback) idle = win.requestIdleCallback(run, { timeout: 1500 });
  else idle = setTimeout(run, 250);
  return {
    cancel(): void {
      cancelled = true;
      if (idle === null) return;
      if (win?.cancelIdleCallback && typeof idle === 'number') win.cancelIdleCallback(idle);
      else clearTimeout(idle as ReturnType<typeof setTimeout>);
      idle = null;
    },
  };
};
