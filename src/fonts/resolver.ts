import { DEFAULT_RATIO } from './ratio';
import { quoteFamily, type FontProbe } from './probe';
import type { FontSourceKind, FontStatus } from './types';

/** A loaded face as the resolver sees it. Names are lower case. */
export interface PoolFace {
  id: string;
  /** Family registered with the browser (original case). */
  family: string;
  families: string[];
  fullNames: string[];
  weight: number;
  italic: boolean;
  boldFlag: boolean;
  ratio: number | null;
  source: FontSourceKind;
}

export interface Resolved {
  /** CSS `font-family` value. */
  family: string;
  /** CSS font-weight / italic to emit. */
  weight: number;
  italic: boolean;
  /** CSS font-size per `\fs` unit. */
  ratio: number;
  ratioSource: 'font-file' | 'canvas' | 'default';
  status: FontStatus;
  verified: boolean;
  mapped: boolean;
  syntheticBold: boolean;
  syntheticItalic: boolean;
  faceId: string | null;
}

export interface ResolveEnv {
  faces: readonly PoolFace[];
  /** Keys lower-cased. */
  fontMap: Readonly<Record<string, string>>;
  probe: FontProbe;
}

const PRIORITY: Record<FontSourceKind, number> = { user: 0, embedded: 1, local: 2 };

/** ASS name as written, minus surrounding spaces and the leading `@` (vertical writing). */
export const cleanName = (fn: string): string => fn.trim().replace(/^@/, '').trim();

/** ASS name => lookup key: cleaned and case-insensitive (like libass/Windows). */
export const normalizeName = (fn: string): string => cleanName(fn).toLowerCase();

/** `\b` => requested weight: 0 normal, 1/-1 bold, 100..900 explicit. */
export const wantedWeight = (b: number): number => (b === 0 ? 400 : b >= 100 && b <= 900 ? Math.round(b / 100) * 100 : 700);

/** Family names of a CSS `font-family` list, unquoted. */
export const cssFamilies = (list: string): string[] =>
  [...list.matchAll(/\s*(?:"([^"]*)"|'([^']*)'|([^,]+))\s*(?:,|$)/g)].map((m) => (m[1] ?? m[2] ?? m[3] ?? '').trim()).filter(Boolean);

/** Legacy helper kept for API compatibility: the plain (pool-less) CSS family for an ASS name. */
export const fontFamilyCss = (fn: string, fontMap: Record<string, string>): string => {
  const name = cleanName(fn);
  return fontMap[name] ?? `${quoteFamily(name)}, sans-serif`;
};

const score = (f: PoolFace, weight: number, italic: boolean): number =>
  (f.italic === italic ? 0 : 10000) + Math.abs(f.weight - weight) + PRIORITY[f.source] / 10;

const byName = (faces: readonly PoolFace[], key: string, local: boolean): { hits: PoolFace[]; viaFamily: boolean } | null => {
  const pool = faces.filter((f) => (f.source === 'local') === local);
  const fam = pool.filter((f) => f.families.includes(key));
  if (fam.length) return { hits: fam, viaFamily: true };
  const full = pool.filter((f) => f.fullNames.includes(key));
  return full.length ? { hits: full, viaFamily: false } : null;
};

const fromFace = (hit: { hits: PoolFace[]; viaFamily: boolean }, b: number, wantItalic: boolean, mapped: boolean, cssTail = 'sans-serif'): Resolved => {
  const want = wantedWeight(b);
  // A full-name / PostScript match names one exact face: keep its look, do not "un-bold" it.
  const f = [...hit.hits].sort((x, y) => score(x, want, wantItalic) - score(y, want, wantItalic))[0];
  const syntheticBold = !f.boldFlag && want > f.weight + 150 && (hit.viaFamily || b !== 0);
  const syntheticItalic = !f.italic && wantItalic;
  return {
    family: `${quoteFamily(f.family)}, ${cssTail}`,
    weight: syntheticBold ? want : f.weight,
    italic: f.italic || syntheticItalic,
    ratio: f.ratio ?? DEFAULT_RATIO,
    ratioSource: f.ratio === null ? 'default' : 'font-file',
    status: f.source, verified: true, mapped, syntheticBold, syntheticItalic, faceId: f.id,
  };
};

/**
 * ASS font name => rendering recipe. Order: loaded face (user > embedded) => `fontMap` => local-font face =>
 * installed system font => generic fallback (status `missing`). Pure: all state comes in through `env`.
 */
export const resolveFont = (env: ResolveEnv, fn: string, b: number, italic: boolean): Resolved => {
  const key = normalizeName(fn);
  const direct = byName(env.faces, key, false);
  if (direct) return fromFace(direct, b, italic, false);
  const map = env.fontMap[key];
  if (map) {
    const names = cssFamilies(map);
    for (const n of names) {
      const hit = byName(env.faces, n.toLowerCase(), false) ?? byName(env.faces, n.toLowerCase(), true);
      if (hit) return fromFace(hit, b, italic, true, names.slice(1).map(quoteFamily).join(', ') || 'sans-serif');
    }
    return external(env, map, names, b, italic, true);
  }
  const local = byName(env.faces, key, true);
  if (local) return fromFace(local, b, italic, false);
  const name = cleanName(fn);
  return external(env, `${quoteFamily(name)}, sans-serif`, [name], b, italic, false);
};

/** A family list the browser resolves itself: probe it, measure the face it lands on. */
const external = (env: ResolveEnv, css: string, names: string[], b: number, italic: boolean, mapped: boolean): Resolved => {
  const weight = wantedWeight(b);
  const answers = names.map((n) => env.probe.installed(n));
  const verified = answers.every((a) => a !== null);
  const installed = answers.some((a) => a === true);
  const measured = env.probe.ratio(css, weight, italic);
  return {
    family: css, weight, italic, mapped,
    ratio: measured ?? DEFAULT_RATIO,
    ratioSource: measured === null ? 'default' : 'canvas',
    status: !verified && !installed ? 'system' : installed ? 'system' : 'missing',
    verified: verified || installed,
    syntheticBold: false, syntheticItalic: false, faceId: null,
  };
};
