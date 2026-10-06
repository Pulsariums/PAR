import type { PreparedLine } from '../anim/Prepared';
import type { AssStyle } from '../types/script';

import { inflate, type Inflater } from './bytes';
import type { FontEnv } from './env';
import { readInputs } from './input';
import { ExternalFonts } from './external';
import { parseAll, parseFont, type ParsedFace } from './loader';
import { createProbe, type FontProbe } from './probe';
import { defaultRegistry, type FontRegistry, type RegisteredFace } from './registry';
import { addMany, lowerKeys, toLoadedFont, toPoolFace, type Loaded } from './pool';
import type { FontProvider } from './provider';
import { resolveFont, type PoolFace, type Resolved } from './resolver';
import type { AddFontOptions, AddFontsEntry, FontInput, FontSourceKind, FontSpec, LoadedFont } from './types';
import { collectUsage, type FontUse } from './usage';
import { extractEmbeddedFiles } from './uudecode';
import { WorkSet } from './work';

export interface FontManagerOptions {
  /** Called (coalesced, once per tick) when the set of usable faces changed: the renderer must re-layout. */
  onChange: () => void;
  registry?: FontRegistry;
  probe?: FontProbe;
  inflater?: Inflater;
}

/**
 * Per-renderer font state: the faces this renderer holds (ref-counted in the shared registry), the lookup cache,
 * the "is anything still loading" gate and the re-layout notification. Resolution rules live in `resolver.ts`.
 */
export class FontManager implements FontEnv {
  private readonly registry: FontRegistry;
  readonly probe: FontProbe;
  readonly inf: Inflater;
  private readonly loaded = new Map<string, Loaded>();
  private readonly work = new WorkSet(() => this.schedule());
  private readonly cache = new Map<string, Resolved>();
  private readonly warns = new Set<string>();
  fontMap: Record<string, string> = {};
  embedded = true;
  readonly ext: ExternalFonts;
  private usage = new Map<string, FontUse>();
  private gate = 0;
  private gen = 0;
  private faces: PoolFace[] | null = null;
  private flushing: Promise<void> | null = null;
  private disposed = false;

  constructor(private readonly opts: FontManagerOptions) {
    this.registry = opts.registry ?? defaultRegistry;
    [this.probe, this.inf] = [opts.probe ?? createProbe(), opts.inflater ?? inflate];
    this.ext = new ExternalFonts({
      usage: () => this.usage, resolve: (n, b, i) => this.resolve(n, b, i), hasMap: (k) => !!this.fontMap[k], register: (p, s) => this.register(p, s),
      dropProvided: () => this.dropStale('provider', new Set()), work: this.work, gate: (d) => { this.gate += d; }, schedule: () => this.schedule(), warn: this.warn, inf: this.inf,
    });
  }

  configure(cfg: { fontMap?: Record<string, string>; embedded?: boolean; useLocalFonts?: boolean; providers?: readonly FontProvider[]; providerTimeout?: number }): void {
    const map = cfg.fontMap ? lowerKeys(cfg.fontMap) : this.fontMap;
    const embedded = cfg.embedded ?? this.embedded;
    const changed = embedded !== this.embedded || JSON.stringify(map) !== JSON.stringify(this.fontMap);
    [this.fontMap, this.embedded] = [map, embedded];
    if (cfg.useLocalFonts && !this.ext.asked) void this.loadLocal();
    const provChanged = cfg.providers ? this.ext.setProviders(cfg.providers, cfg.providerTimeout ?? this.ext.timeoutMs) : false;
    if (provChanged) this.ext.refresh();
    if (changed) this.schedule();
  }

  /** New script: recompute needed fonts, load its `[Fonts]` section, drop embedded faces it no longer carries. */
  setScript(text: string | null, lines: readonly PreparedLine[], styles: Map<string, AssStyle>): void {
    const gen = ++this.gen;
    this.warns.clear();
    this.usage = collectUsage(lines, styles);
    const files = this.embedded && text ? extractEmbeddedFiles(text) : [];
    if (files.length === 0) { this.dropStale('embedded', new Set()); this.ext.refresh(); } else {
      this.gate++;
      this.work.track(parseAll(files, 'embedded font', this.warn, this.inf).then(async (parsed) => {
        const fresh = parsed.map((p) => this.register(p, 'embedded'));
        await Promise.all(fresh.map((f) => f.loaded));
        if (gen === this.gen) { this.dropStale('embedded', new Set(parsed.map((p) => p.key))); this.ext.refresh(); }
      }).finally(() => { this.gate--; }));
    }
    this.ext.ensureLocal();
    this.schedule();
  }

  /** Loads fonts given as input (File, Blob, bytes, URL, zip). TTC files yield one entry per face. */
  async add(input: FontInput, o: AddFontOptions = {}): Promise<LoadedFont[]> {
    return this.work.track((async () => {
      const out: RegisteredFace[] = [];
      for (const file of await readInputs(input)) for (const p of await parseFont(file, o.family, this.inf)) out.push(this.register(p, 'user'));
      await Promise.all(out.map((f) => f.loaded));
      return out.flatMap((f) => (this.loaded.has(f.key) ? [toLoadedFont(f.key, this.loaded.get(f.key)!)] : []));
    })());
  }

  /** Adds several inputs; one failing file does not stop the others. */
  addMany(specs: Iterable<FontSpec>): Promise<AddFontsEntry[]> {
    return addMany((i, o) => this.add(i, o), specs);
  }

  remove(id: string): boolean {
    const l = this.loaded.get(id);
    if (!l?.sources.delete('user')) return false;
    if (l.sources.size === 0) this.discard(id);
    this.schedule();
    this.ext.refresh();
    return true;
  }

  list(): LoadedFont[] {
    return [...this.loaded].map(([k, l]) => toLoadedFont(k, l));
  }

  /** Installed fonts via the Local Font Access API (needs a user gesture); false when unavailable or denied. */
  loadLocal(): Promise<boolean> {
    return this.ext.loadLocal();
  }

  /** Forget "provider has no such font" answers and ask again for what is still missing (e.g. after the font library changed). */
  refreshProviders(): void {
    this.ext.tried.clear();
    this.ext.refresh();
  }

  resolve(fn: string, bold: number, italic: boolean): Resolved {
    const key = `${fn}\0${bold}\0${italic}`;
    let r = this.cache.get(key);
    if (!r) this.cache.set(key, (r = resolveFont({ faces: this.pool(), fontMap: this.fontMap, probe: this.probe }, fn, bold, italic)));
    return r;
  }

  /** Faces the script needs are still loading: the renderer must not draw yet. */
  get blocking(): boolean {
    return this.gate > 0 || [...this.loaded.values()].some((l) => l.face.state === 'loading');
  }

  get fontUsage(): ReadonlyMap<string, FontUse> { return this.usage; }
  get warnings(): string[] { return [...this.warns]; }
  /** Resolves when no font work is outstanding and the re-layout has run. */
  async idle(): Promise<void> {
    await this.work.idle();
    await this.flushing;
  }

  dispose(): void {
    this.disposed = true;
    this.ext.dispose();
    [...this.loaded.keys()].forEach((k) => this.discard(k));
  }

  pool(): PoolFace[] {
    return (this.faces ??= [...this.loaded.values()].filter((l) => l.face.state !== 'failed').map(toPoolFace));
  }

  register(p: ParsedFace, source: FontSourceKind): RegisteredFace {
    const face = this.registry.acquire(this, p);
    const l = this.loaded.get(p.key) ?? { face, sources: new Set<FontSourceKind>(), label: p.label };
    l.sources.add(source);
    this.loaded.set(p.key, l);
    if (p.degraded) this.warn(`${p.label}: ${p.degraded}`);
    this.faces = null;
    void face.loaded.then(() => {
      if (face.state === 'failed') this.warn(`${p.label}: browser rejected the font (${face.error ?? 'unknown error'})`);
      this.schedule();
    });
    return face;
  }

  private discard(key: string): void {
    this.registry.release(this, key);
    this.loaded.delete(key);
    this.faces = null;
  }

  private dropStale(source: FontSourceKind, keep: ReadonlySet<string>): void {
    for (const [k, l] of [...this.loaded]) {
      if (keep.has(k) || !l.sources.delete(source)) continue;
      if (l.sources.size === 0) this.discard(k);
    }
    this.schedule();
  }

  private warn = (m: string): void => { this.warns.add(m); };
  private schedule(): void {
    if (this.flushing || this.disposed) return;
    this.flushing = Promise.resolve().then(() => {
      this.flushing = null;
      if (this.disposed) return;
      this.cache.clear();
      this.faces = null;
      this.probe.clear();
      this.opts.onChange();
    });
  }
}

