import type { FontProvider, FontRequest, FontSource } from './provider';
import { normalizeName } from './resolver';

/** One downloadable face. `weight` defaults to 400, `italic` to false. */
export interface UrlFontEntry {
  url: string;
  weight?: number;
  italic?: boolean;
}

/** `{ "Open Sans": "https://.../OpenSans.woff2" }`, or several faces per family. */
export type UrlFontMap = Record<string, string | UrlFontEntry | UrlFontEntry[]>;

/** Manifest JSON shape: `{ "fonts": [{ "family": "Open Sans", "url": "...", "weight": 700, "italic": false, "aliases": ["OpenSans"] }] }`. */
export interface FontManifest {
  fonts: Array<UrlFontEntry & { family: string; aliases?: string[] }>;
}

const toEntries = (v: string | UrlFontEntry | UrlFontEntry[]): UrlFontEntry[] =>
  (Array.isArray(v) ? v : [typeof v === 'string' ? { url: v } : v]).filter((e) => e && typeof e.url === 'string');

const fromManifest = (m: unknown): Map<string, UrlFontEntry[]> => {
  const out = new Map<string, UrlFontEntry[]>();
  const list = m && typeof m === 'object' && Array.isArray((m as FontManifest).fonts) ? (m as FontManifest).fonts : [];
  for (const f of list) {
    if (!f || typeof f.family !== 'string' || typeof f.url !== 'string') continue;
    for (const name of [f.family, ...(Array.isArray(f.aliases) ? f.aliases : [])]) {
      const k = normalizeName(String(name));
      out.set(k, [...(out.get(k) ?? []), f]);
    }
  }
  return out;
};

const pick = (list: UrlFontEntry[], { weight, italic }: FontRequest): UrlFontEntry =>
  [...list].sort((a, b) => cost(a, weight, italic) - cost(b, weight, italic))[0];

const cost = (e: UrlFontEntry, weight: number, italic: boolean): number =>
  ((e.italic ?? false) === italic ? 0 : 10000) + Math.abs((e.weight ?? 400) - weight);

/**
 * A remote provider: a URL map, or a manifest JSON fetched lazily (once). Fonts are fetched only when a script asks
 * for the family, and each URL is downloaded once per provider (the Blob is kept, so a regular and a bold request
 * that share a file cost one download). CORS applies. PAR hosts no fonts: the URLs are yours.
 */
export const createUrlProvider = (name: string, source: UrlFontMap | { manifest: string }): FontProvider => {
  let table: Promise<Map<string, UrlFontEntry[]>> | null = null;
  const blobs = new Map<string, Promise<Blob>>();
  const load = (): Promise<Map<string, UrlFontEntry[]>> => (table ??= 'manifest' in source && typeof source.manifest === 'string'
    ? fetch(source.manifest).then((r) => { if (!r.ok) throw new Error(`manifest ${source.manifest}: HTTP ${r.status}`); return r.json(); }).then(fromManifest)
    : Promise.resolve(new Map(Object.entries(source as UrlFontMap).map(([k, v]) => [normalizeName(k), toEntries(v)] as [string, UrlFontEntry[]]))));
  const entries = async (family: string): Promise<UrlFontEntry[]> => (await load()).get(normalizeName(family)) ?? [];
  const download = (url: string): Promise<Blob> => {
    let b = blobs.get(url);
    if (!b) {
      b = fetch(url).then((r) => { if (!r.ok) throw new Error(`fetch ${url}: HTTP ${r.status}`); return r.blob(); });
      blobs.set(url, b);
      b.catch(() => blobs.delete(url));
    }
    return b;
  };
  return {
    name,
    async has(family) { return (await entries(family)).length > 0; },
    async get(family, request): Promise<FontSource | null> {
      const list = await entries(family);
      return list.length ? download(pick(list, request).url) : null;
    },
  };
};
