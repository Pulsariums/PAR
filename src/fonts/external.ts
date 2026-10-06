import type { Inflater } from './bytes';
import { localMatches, queryLocal, type LocalFontData } from './local';
import { parseAll, type ParsedFace } from './loader';
import type { FontProvider } from './provider';
import { fetchFromProviders } from './providerLoad';
import type { RegisteredFace } from './registry';
import type { Resolved } from './resolver';
import type { FontSourceKind } from './types';
import type { FontUse } from './usage';
import type { WorkSet } from './work';

/** What the font manager lends to the loaders of fonts that do not come from the page's own inputs. */
export interface ExternalHost {
  usage(): ReadonlyMap<string, FontUse>;
  resolve(fn: string, bold: number, italic: boolean): Resolved;
  hasMap(key: string): boolean;
  register(p: ParsedFace, source: FontSourceKind): RegisteredFace;
  /** Removes every face that came from a provider (the provider set changed). */
  dropProvided(): void;
  work: WorkSet;
  gate(delta: number): void;
  schedule(): void;
  warn(m: string): void;
  inf: Inflater;
}

/** Local Font Access faces and `FontProvider` faces: loaded on demand for the names a script uses and nothing earlier covers. */
export class ExternalFonts {
  providers: readonly FontProvider[] = [];
  timeoutMs = 5000;
  /** Requests already made (provider, family, weight, italic). Cleared when a provider announces a change. */
  readonly tried = new Set<string>();
  /** provider name => families it supplied since the provider set last changed. */
  hits: Record<string, string[]> = {};
  private local: LocalFontData[] | null = null;
  private localAsked = false;
  private readonly localTried = new Set<string>();
  private unsub: Array<() => void> = [];

  constructor(private readonly h: ExternalHost) {}

  get asked(): boolean { return this.localAsked; }

  /** Replaces the provider list. Returns true when it changed (the caller re-resolves). */
  setProviders(list: readonly FontProvider[], timeoutMs: number): boolean {
    this.timeoutMs = timeoutMs;
    if (list.length === this.providers.length && list.every((p, i) => p === this.providers[i])) return false;
    this.unsub.forEach((u) => u());
    this.providers = list;
    this.tried.clear();
    this.hits = {};
    this.h.dropProvided();
    this.unsub = list.flatMap((p) => (p.subscribe ? [p.subscribe(() => { this.tried.clear(); this.refresh(); })] : []));
    return true;
  }

  /** Is the request already served by something that must win over a provider (or by a good-enough provider face)? */
  covered = (name: string, b: number, i: boolean): boolean => {
    if (this.h.hasMap(name.trim().replace(/^@/, '').trim().toLowerCase())) return true;
    const r = this.h.resolve(name, b, i);
    return r.status === 'user' || r.status === 'embedded' || (r.status === 'provider' && !r.syntheticBold && !r.syntheticItalic);
  };

  /** Asks the providers for the current script's uncovered fonts. The renderer holds back drawing until this settles (or times out). */
  refresh(): void {
    if (!this.providers.length) return;
    const needs = [...this.h.usage().values()].filter((u) => [...u.looks.values()].some((l) => !this.covered(u.name, l.b, l.i)));
    if (!needs.length) return;
    this.h.gate(1);
    let open = true;
    const release = (): void => { if (open) { open = false; this.h.gate(-1); this.h.schedule(); } };
    const timer = setTimeout(release, this.timeoutMs);
    const job = fetchFromProviders(needs, {
      providers: this.providers, timeoutMs: this.timeoutMs, covered: this.covered, tried: this.tried, warn: this.h.warn, inf: this.h.inf,
      accept: async (faces) => { await Promise.all(faces.map((f) => this.h.register(f, 'provider').loaded)); },
    }).then((hits) => { for (const [k, v] of Object.entries(hits)) this.hits[k] = [...new Set([...(this.hits[k] ?? []), ...v])]; });
    void this.h.work.track(job.finally(() => { clearTimeout(timer); release(); }));
  }

  /** Installed fonts via the Local Font Access API (needs a user gesture); false when unavailable or denied. */
  async loadLocal(): Promise<boolean> {
    this.localAsked = true;
    const all = await queryLocal();
    if (all) { this.local = all; this.ensureLocal(); }
    return all !== null;
  }

  /** Order: loaded face => fontMap => provider => local face; only names those leave open are looked up locally. */
  ensureLocal(): void {
    const covered = (key: string, use: { name: string }): boolean =>
      this.h.hasMap(key) || ['user', 'embedded', 'provider', 'local'].includes(this.h.resolve(use.name, 0, false).status);
    for (const hits of this.local ? localMatches(this.h.usage(), this.local, covered, this.localTried) : []) {
      this.h.gate(1);
      const files = hits.map(async (x) => ({ name: x.fullName, data: new Uint8Array(await (await x.blob()).arrayBuffer()) }));
      void this.h.work.track(Promise.allSettled(files).then((r) => parseAll(r.flatMap((x) => (x.status === 'fulfilled' ? [x.value] : [])), 'local font', this.h.warn, this.h.inf))
        .then((parsed) => { parsed.forEach((p) => this.h.register(p, 'local')); }).finally(() => { this.h.gate(-1); }));
    }
  }

  dispose(): void { this.unsub.forEach((u) => u()); this.unsub = []; }
}
