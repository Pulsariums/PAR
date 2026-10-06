import type { FontManager } from '../fonts/FontManager';
import { normalizeName } from '../fonts/resolver';
import { currentPreflight } from '../preflight/instance';
import type { PreflightReport } from '../preflight/types';

const EMPTY = '\u0001';

export type MissingDecision = 'continue' | 'wait';

/** Handed to `onMissingFonts`: `continue()` ends a hold (also callable later, from a button). */
export interface MissingFontsControl {
  continue(): void;
}

/**
 * Called once per loaded script, as soon as its fonts have settled and at least one family is missing.
 * - `'continue'` / nothing: draw with the fallback font (default).
 * - `'wait'`: do not draw the lines that use a missing family until `ctrl.continue()` or until the fonts arrive.
 * - a Promise: the same as `'wait'` while it is pending (the host is asking the user); it then applies its answer.
 * Throwing or rejecting counts as `'continue'`.
 */
export type MissingFontsHandler = (report: PreflightReport, ctrl: MissingFontsControl) => MissingDecision | void | Promise<MissingDecision | void>;

/**
 * The "font is missing, continue?" state of one renderer. Rule of what is drawn while holding: lines that use only
 * available fonts are drawn normally; every event that uses (in any fragment) a missing family is not drawn at all.
 */
export class MissingFonts {
  /** Event indexes not to draw, or null. */
  hold: ReadonlySet<number> | null = null;
  private last = EMPTY;
  private asked = false;
  private holding = false;
  private token = 0;
  private latest: PreflightReport | null = null;
  private readonly listeners = new Set<(r: PreflightReport) => void>();

  constructor(
    private readonly fm: FontManager,
    private readonly handler: () => MissingFontsHandler | null | undefined,
    private readonly redraw: () => void,
  ) {}

  /** Last report that was announced (null until a script had missing fonts). */
  get report(): PreflightReport | null { return this.latest; }

  on(fn: (r: PreflightReport) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /** A new script was loaded: forget the previous decision. */
  reset(): void {
    this.last = EMPTY;
    this.asked = false;
    this.holding = false;
    this.hold = null;
    this.token++;
  }

  /** Called after every font change, before the re-layout. Does nothing while fonts are still loading. */
  update(): void {
    if (this.fm.blocking) return;
    const rep = currentPreflight(this.fm);
    // announced again whenever the missing families or the glyph gaps (font present, characters absent) change
    const key = `${rep.missing.map((m) => m.name).join('\0')}\u0001${Object.entries(rep.missingGlyphs).map(([n, g]) => `${n}:${g.count}`).join('\0')}`;
    if (key !== this.last) {
      this.last = key;
      this.latest = rep;
      this.listeners.forEach((fn) => fn(rep));
    }
    if (!rep.missing.length) this.holding = false;
    else if (!this.asked) { this.asked = true; this.decide(rep); }
    this.hold = this.holding ? this.linesOf(rep) : null;
  }

  continue(): void {
    this.holding = false;
    this.hold = null;
    this.token++;
    this.redraw();
  }

  dispose(): void {
    this.listeners.clear();
    this.token++;
  }

  private linesOf(rep: PreflightReport): Set<number> {
    const out = new Set<number>();
    for (const m of rep.missing) this.fm.fontUsage.get(normalizeName(m.name))?.lines.forEach((l) => out.add(l));
    return out;
  }

  private decide(rep: PreflightReport): void {
    const handler = this.handler();
    if (!handler) return;
    const token = ++this.token;
    const stop = (): void => { if (token === this.token && this.holding) this.continue(); };
    try {
      const r = handler(rep, { continue: () => this.continue() });
      if (r && typeof (r as Promise<unknown>).then === 'function') {
        this.holding = true;
        (r as Promise<MissingDecision | void>).then((d) => { if (d !== 'wait') stop(); }, stop);
      } else if (r === 'wait') this.holding = true;
    } catch {
      this.holding = false;
    }
  }
}
