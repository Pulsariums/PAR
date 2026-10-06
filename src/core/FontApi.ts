import { FontManager } from '../fonts/FontManager';
import { buildReport } from '../fonts/report';
import type { AddFontOptions, AddFontsEntry, FontInput, FontReport, FontSpec, LoadedFont } from '../fonts/types';

/**
 * The font-facing half of the renderer: owns the FontManager and exposes the public font API.
 * The renderer implements `onFontsChanged()` (re-layout) and calls `fonts.*` from its own lifecycle.
 */
export abstract class FontApi {
  protected readonly fonts: FontManager;
  private readonly fontListeners = new Set<() => void>();

  protected constructor() {
    this.fonts = new FontManager({
      onChange: () => {
        this.onFontsChanged();
        this.fontListeners.forEach((fn) => fn());
      },
    });
  }

  /** Called when usable faces changed (loaded, removed, mapped): drop measured layout and redraw. */
  protected abstract onFontsChanged(): void;

  /**
   * Resolves once every font load started so far is finished and the resulting re-layout ran.
   * Text is never drawn while the script's fonts are still loading, so await this before taking a screenshot.
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

  /** Every face this renderer holds: user-supplied, embedded in the script, or loaded from the machine. */
  listFonts(): LoadedFont[] {
    return this.fonts.list();
  }

  /** Fonts the current script needs, how each resolves and which styles / lines use it. */
  getFontReport(): FontReport {
    return buildReport(this.fonts);
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
