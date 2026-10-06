import type { FontManager } from '../fonts/FontManager';
import { parseAll } from '../fonts/loader';
import { normalizeName, type PoolFace } from '../fonts/resolver';
import type { FontUse } from '../fonts/usage';
import { extractEmbeddedFiles } from '../fonts/uudecode';

import { runProviders, scanScript, toPool } from './preflight';
import { buildPreflight, type ResolveCtx } from './report';
import type { LineSource, PreflightReport, UsedFont } from './types';

const SAMPLE = 8;

const toUsed = (u: FontUse): UsedFont => ({
  name: u.name, looks: u.looks, styles: u.styles, lineCount: u.lines.size, sample: [...u.lines].sort((a, b) => a - b).slice(0, SAMPLE), chars: u.chars,
});

/** Provider hits of the current script only (the manager keeps a cumulative record). */
const hitsFor = (all: Record<string, string[]>, uses: Iterable<{ name: string }>): Record<string, string[]> => {
  const want = new Set([...uses].map((u) => normalizeName(u.name)));
  const out: Record<string, string[]> = {};
  for (const [p, names] of Object.entries(all)) {
    const mine = names.filter((n) => want.has(normalizeName(n)));
    if (mine.length) out[p] = mine;
  }
  return out;
};

const ctxOf = (fm: FontManager, extra: readonly PoolFace[] = []): ResolveCtx => ({
  faces: () => (extra.length ? [...extra, ...fm.pool()] : fm.pool()), fontMap: fm.fontMap, probe: fm.probe,
});

/** Report for the script the renderer holds right now, from its live font state (exact: same data the renderer draws with). */
export const currentPreflight = (fm: FontManager): PreflightReport => {
  const uses = [...fm.fontUsage.values()].map(toUsed);
  return buildPreflight(uses, ctxOf(fm), hitsFor(fm.ext.hits, uses), fm.warnings, {
    lines: 0, events: new Set([...fm.fontUsage.values()].flatMap((u) => [...u.lines])).size,
  });
};

/**
 * `par.preflight(text)`: scans another script, asks the providers for what is missing and *keeps* what they return
 * registered in this renderer (so switching to that script later is instant), then reports.
 * Without `source`, waits for the current script's font work (`ready`) and reports on it.
 */
export const preflightWith = async (fm: FontManager, source?: LineSource | null): Promise<PreflightReport> => {
  if (source === undefined) { await fm.idle(); return currentPreflight(fm); }
  const sc = await scanScript(source, {});
  const warnings = [...sc.warnings];
  const warn = (m: string): void => { warnings.push(m); };
  const embedded: PoolFace[] = fm.embedded && sc.fontLines.length
    ? (await parseAll(extractEmbeddedFiles(['[Fonts]', ...sc.fontLines].join('\n')), 'embedded font', warn, fm.inf)).map((p) => toPool(p, 'embedded')) : [];
  const ctx = ctxOf(fm, embedded);
  const hits = await runProviders(sc.uses, ctx, fm.ext.providers, fm.ext.timeoutMs, async (p) => { await fm.register(p, 'provider').loaded; }, fm.ext.tried, warn);
  await fm.idle();
  return buildPreflight(sc.uses.values(), ctx, hits, warnings, { lines: sc.lines, events: sc.events });
};
