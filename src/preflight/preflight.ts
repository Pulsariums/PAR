import { inflate } from '../fonts/bytes';
import { readInputs } from '../fonts/input';
import { parseAll, parseFont, type ParsedFace } from '../fonts/loader';
import { createProbe } from '../fonts/probe';
import { fetchFromProviders } from '../fonts/providerLoad';
import type { FontProvider } from '../fonts/provider';
import { cleanName, normalizeName, resolveFont, type PoolFace } from '../fonts/resolver';
import { sizeRatio } from '../fonts/ratio';
import type { FontSourceKind, FontSpec } from '../fonts/types';
import { extractEmbeddedFiles } from '../fonts/uudecode';

import { eachLine } from './lines';
import { buildPreflight, type ResolveCtx } from './report';
import { UsageScanner } from './scan';
import type { LineSource, PreflightOptions, PreflightReport, UsedFont, UsedFontInput } from './types';

export const toPool = (p: ParsedFace, source: FontSourceKind): PoolFace => ({
  id: p.key, family: p.info.family, families: p.info.families.map((s) => s.toLowerCase()), fullNames: p.info.fullNames.map((s) => s.toLowerCase()),
  weight: p.info.weight, italic: p.info.italic, boldFlag: p.info.boldFlag, ratio: sizeRatio(p.info.metrics), source, coverage: p.info.coverage,
});

const blank = (name: string): UsedFont => ({ name, looks: new Map(), styles: new Set(), lineCount: 0, sample: [], chars: new Set() });

/** Merges externally known families (`usedFonts`) into the scan result. */
export const mergeUsed = (uses: Map<string, UsedFont>, extra: Iterable<UsedFontInput>): void => {
  for (const x of extra) {
    const [family, bold, italic] = typeof x === 'string' ? [x, 0, false] : [x.family, x.bold === true ? 1 : x.bold === false || x.bold === undefined ? 0 : x.bold, x.italic === true];
    const name = cleanName(family);
    if (!name) continue;
    const key = normalizeName(name);
    const use = uses.get(key) ?? blank(name);
    use.looks.set(`${bold}|${italic}`, { b: bold, i: italic });
    uses.set(key, use);
  }
};

/** Scans a script (text, lines or a stream of lines) into used fonts, plus its embedded font files. */
export const scanScript = async (source: LineSource | null | undefined, o: PreflightOptions): Promise<UsageScanner> => {
  const sc = new UsageScanner(o.glyphs !== false);
  if (source !== null && source !== undefined) await eachLine(source, (l) => sc.feed(l), { signal: o.signal, onProgress: o.onProgress });
  if (o.usedFonts) mergeUsed(sc.uses, o.usedFonts);
  return sc;
};

/** Parses font inputs into faces without registering them with the browser. */
export const parseSpecs = async (specs: FontSpec[], warn: (m: string) => void): Promise<ParsedFace[]> => {
  const out: ParsedFace[] = [];
  for (const spec of specs) {
    const { source, family } = spec && typeof spec === 'object' && 'source' in spec ? spec : { source: spec, family: undefined };
    try { for (const f of await readInputs(source)) out.push(...(await parseFont(f, family))); } catch (e) { warn(`font input: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return out;
};

/**
 * Which fonts will this script need, and will each of them be found? Resolves every family through the same chain as
 * the renderer (user / embedded faces, `fontMap`, providers, system) without rendering anything, asks providers for what
 * is not covered (their answers are parsed, nothing is registered with the page), and reports.
 * Memory use does not depend on the script size: events are never kept (see `UsageScanner`). Works without a DOM
 * (system fonts then cannot be probed: they are reported as `system`, `verified: false`).
 */
export const preflightScript = async (source: LineSource | null | undefined, options: PreflightOptions = {}): Promise<PreflightReport> => {
  const warnings: string[] = [];
  const warn = (m: string): void => { warnings.push(m); };
  const sc = await scanScript(source, options);
  warnings.push(...sc.warnings);
  const pool: PoolFace[] = (await parseSpecs(options.fonts ?? [], warn)).map((p) => toPool(p, 'user'));
  if (options.embeddedFonts !== false && sc.fontLines.length) {
    pool.push(...(await parseAll(extractEmbeddedFiles(['[Fonts]', ...sc.fontLines].join('\n')), 'embedded font', warn, inflate)).map((p) => toPool(p, 'embedded')));
  }
  const fontMap = Object.fromEntries(Object.entries(options.fontMap ?? {}).map(([k, v]) => [normalizeName(k), v]));
  const ctx: ResolveCtx = { faces: () => pool, fontMap, probe: createProbe() };
  const hits = await runProviders(sc.uses, ctx, options.fontProviders ?? [], options.providerTimeout ?? 5000, (p) => { pool.push(toPool(p, 'provider')); }, new Set(), warn);
  return buildPreflight(sc.uses.values(), ctx, hits, warnings, { lines: sc.lines, events: sc.events });
};

/** Shared by the static helper and `PARRenderer.preflight(text)`: ask providers for the uncovered looks, collecting the faces. */
export const runProviders = (
  uses: Map<string, UsedFont>,
  ctx: ResolveCtx,
  providers: readonly FontProvider[],
  timeoutMs: number,
  take: (p: ParsedFace) => void | Promise<void>,
  tried: Set<string>,
  warn: (m: string) => void,
): Promise<Record<string, string[]>> => {
  if (!providers.length) return Promise.resolve({});
  const covered = (name: string, b: number, i: boolean): boolean => {
    if (ctx.fontMap[normalizeName(name)]) return true;
    const r = buildOne(ctx, name, b, i);
    return r.status === 'user' || r.status === 'embedded' || (r.status === 'provider' && !r.syntheticBold && !r.syntheticItalic);
  };
  return fetchFromProviders(uses.values(), { providers, timeoutMs, covered, tried, warn, accept: async (faces) => { for (const f of faces) await take(f); } });
};

const buildOne = (ctx: ResolveCtx, name: string, b: number, i: boolean) => resolveFont({ faces: ctx.faces(), fontMap: ctx.fontMap, probe: ctx.probe }, name, b, i);
