import { FontManager } from '../fonts/FontManager';
import { buildReport } from '../fonts/report';
import type { AddFontOptions, AddFontsEntry, FontInput, FontReport, FontSpec, LoadedFont } from '../fonts/types';
import { preflightWith } from '../preflight/instance';
import type { LineSource, PreflightReport } from '../preflight/types';
import type { ResolvedOptions } from '../types/options';

import { MissingFonts } from './MissingFonts';

/**
 * The font-facing half of the renderer: owns the FontManager and exposes the public font API.
 * The renderer implements `onFontsChanged()` (re-layout) and calls `fonts.*` from its own lifecycle.
 */
export abstract class FontApi {
  protected readonly fonts: FontManager;
  protected readonly missing: MissingFonts;
  private readonly fontListeners = new Set<() => void>();
  private fontOpts: Pick<ResolvedOptions, 'onMissingFonts'> = { onMissingFonts: null };

  protected constructor() {
    this.fonts = new FontManager({
      onChange: () => {
        this.missing.update();
        this.onFontsChanged();
        this.fontListeners.forEach((fn) => fn());
      },
    });
    this.missing = new MissingFonts(this.fonts, () => this.fontOpts.onMissingFonts, () => this.onFontsChanged());
  }

  /** Called when usable faces changed (loaded, removed, mapped) or the hold changed: drop measured layout and redraw. */
  protected abstract onFontsChanged(): void;

  /** Applies the font-related options (called on creation and by `setOptions`). */
  protected configureFonts(o: ResolvedOptions): void {
    this.fontOpts = o;
    this.fonts.configure({ fontMap: o.fontMap, embedded: o.embeddedFonts, useLocalFonts: o.useLocalFonts, providers: o.fontProviders, providerTimeout: o.providerTimeout });
  }

  /** A new script was loaded: the missing-font decision starts over. */
  protected resetMissing(): void { this.missing.reset(); }

  protected disposeFonts(): void {
    this.missing.dispose();
    this.fonts.dispose();
  }

  /**
   * Resolves once every font load started so far is finished (embedded, user, provider, local) and the re-layout ran.
   * By then `onMissingFonts` has been called. It never waits for a person: lines held back by a 'wait' decision stay
   * hidden after `ready` resolves. Text is never drawn while the script's fonts are still loading.
   */
  get ready(): Promise<void> {
    return this.fonts.idle();
  }

  /** Loads a font (File, Blob, bytes, URL string or a .zip of fonts). The family name is read from the font itself. */
  addFont(input: FontInput, options?: AddFontOptions): Promise<LoadedFont[]> {
    return this.fonts.add(input, options);
  }

  /** Loads many fonts at once (e.g. a `FileList` from a drop or a folder picker). One bad file does not stop the rest. */
  addFonts(inputs: Iterable<FontSpec> | ArrayLike<FontSpec>): Promise<AddFontsEntry[]> {
    return this.fonts.addMany(Array.from(inputs as ArrayLike<FontSpec>));
  }

  /** Removes a font added with `addFont`/`addFonts` (by `LoadedFont.id`). */
  removeFont(id: string): boolean {
    return this.fonts.remove(id);
  }

  /** Every face this renderer holds: user-supplied, embedded in the script, from a provider, or loaded from the machine. */
  listFonts(): LoadedFont[] {
    return this.fonts.list();
  }

  /** Fonts the current script needs, how each resolves and which styles / lines use it. */
  getFontReport(): FontReport {
    return buildReport(this.fonts);
  }

  /**
   * Checks fonts without rendering. No argument: waits for the current script's font work and reports on it.
   * With a script (text, or lines of a huge file): scans it cheaply, asks the providers for what is missing and keeps
   * what they return in this renderer. See `preflightScript` for the instance-free variant.
   */
  preflight(script?: LineSource | null): Promise<PreflightReport> {
    return preflightWith(this.fonts, script);
  }

  /** The report of the last `missingfonts` announcement (null when the current script never had missing fonts). */
  get missingFonts(): PreflightReport | null {
    return this.missing.report;
  }

  /** Ends a 'wait' decision: lines that use missing fonts are drawn with the fallback font. */
  continueWithMissing(): void {
    this.missing.continue();
  }

  /** Subscribes to `missingfonts`: fires when the missing families or the glyph gaps (`missingGlyphs`) of the current script change, also back to none (`ok: true`, empty `missingGlyphs`). */
  on(_event: 'missingfonts', fn: (report: PreflightReport) => void): () => void {
    return this.missing.on(fn);
  }

  /** Forgets "not found" answers of the providers and asks again (a provider without `subscribe` got new fonts). */
  refreshProviders(): void {
    this.fonts.refreshProviders();
  }

  /** Reads installed fonts (Local Font Access API). Call from a click handler; resolves false when unsupported or denied. */
  loadLocalFonts(): Promise<boolean> {
    return this.fonts.loadLocal();
  }

  /** Subscribes to font changes (may also fire without a visible change). Returns the unsubscribe function. */
  onFontsChange(fn: () => void): () => void {
    this.fontListeners.add(fn);
    return () => { this.fontListeners.delete(fn); };
  }
}
