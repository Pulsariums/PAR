import type { FontProbe } from '../fonts/probe';
import { hasCp } from '../fonts/coverage';
import { resolveFont, type PoolFace, type Resolved } from '../fonts/resolver';

import { MAX_GLYPH_SAMPLE, type MissingGlyphs, type PreflightEntry, type PreflightReport, type UsedFont } from './types';

export interface ResolveCtx {
  faces(): readonly PoolFace[];
  /** Keys lower-cased. */
  fontMap: Readonly<Record<string, string>>;
  probe: FontProbe;
}

/** Code points `used` that the face's glyph table lacks (exact count, capped sample). null when the table is unknown. */
export const lackingGlyphs = (cov: Uint32Array | null | undefined, used: ReadonlySet<number>): MissingGlyphs | null => {
  if (!cov || used.size === 0) return null;
  let count = 0;
  const sample: number[] = [];
  for (const cp of [...used].sort((a, b) => a - b)) {
    if (hasCp(cov, cp)) continue;
    count++;
    if (sample.length < MAX_GLYPH_SAMPLE) sample.push(cp);
  }
  return count ? { count, sample } : null;
};

const entryOf = (use: UsedFont, rs: Resolved[], faces: readonly PoolFace[], provider: string | undefined): PreflightEntry => {
  const first = rs[0];
  const entry: PreflightEntry = {
    name: use.name, status: first.status, family: first.family, verified: first.verified, mapped: first.mapped,
    syntheticBold: rs.some((r) => r.syntheticBold), syntheticItalic: rs.some((r) => r.syntheticItalic),
    styles: [...use.styles].sort(), lineCount: use.lineCount,
  };
  if (provider && first.status === 'provider') entry.provider = provider;
  // every face the looks resolve to must have the glyph, so report the union of what the worst face lacks
  const gaps = rs.map((r) => lackingGlyphs(faces.find((f) => f.id === r.faceId)?.coverage, use.chars)).filter((g): g is MissingGlyphs => g !== null);
  const worst = gaps.sort((a, b) => b.count - a.count)[0];
  if (worst) entry.missingGlyphs = worst;
  return entry;
};

/** Resolves every used font through the full chain (no rendering) and sorts the answer into the report buckets. */
export const buildPreflight = (
  uses: Iterable<UsedFont>,
  ctx: ResolveCtx,
  hits: Record<string, string[]>,
  warnings: string[],
  stats: { lines: number; events: number },
): PreflightReport => {
  const faces = ctx.faces();
  const env = { faces, fontMap: ctx.fontMap, probe: ctx.probe };
  const entries: PreflightEntry[] = [];
  for (const use of uses) {
    const looks = [...use.looks.values()];
    if (!looks.length) looks.push({ b: 0, i: false });
    const lower = use.name.toLowerCase();
    const provider = Object.keys(hits).find((p) => hits[p].some((n) => n.toLowerCase() === lower));
    entries.push(entryOf(use, looks.map((l) => resolveFont(env, use.name, l.b, l.i)), faces, provider));
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const missing = entries.filter((e) => e.status === 'missing');
  const missingGlyphs = Object.fromEntries(entries.flatMap((e) => (e.missingGlyphs ? [[e.name, e.missingGlyphs] as const] : [])));
  return {
    ok: missing.length === 0,
    resolved: entries.filter((e) => e.status !== 'missing'),
    missing,
    synthetic: entries.filter((e) => e.status !== 'missing' && (e.syntheticBold || e.syntheticItalic)),
    providerHits: hits, missingGlyphs, warnings, stats: { ...stats, fonts: entries.length },
  };
};
