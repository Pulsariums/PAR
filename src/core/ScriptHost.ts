import type { FontManager } from '../fonts/FontManager';
import { collectUsage } from '../fonts/usage';
import { parseScript } from '../parser/ScriptParser';
import { isSubtitleSource, type SourceScript, type SubtitleSource } from '../source/types';
import type { AssEvent, AssStyle, ParsedScript, ScriptInfo } from '../types/script';

import type { Scene } from './Scene';
import { WindowFeed, type SourceStatsReport } from './WindowFeed';

export interface HostDeps {
  scene(): Scene;
  fonts: FontManager;
  windowSeconds(): number;
  /** The window or the script changed: redraw the current time. */
  changed(): void;
  /** A new script is being loaded: reset the missing-font decision. */
  reset(): void;
  error(e: unknown): void;
}

const EMPTY: SourceStatsReport = { windowEvents: 0, windowRange: null, loading: false, bytesRead: 0, decodeMs: 0, indexMs: 0 };

/**
 * Where the loaded script lives: either parsed whole (a text, the classic path) or behind a `WindowFeed` (a `SubtitleSource`:
 * only a sliding window of events exists in memory). The renderer only talks to this class.
 */
export class ScriptHost {
  private full: ParsedScript | null = null;
  private feed: WindowFeed | null = null;
  private win: SourceScript | null = null;
  private ready = false;
  private token = 0;
  private diagnosticsEnabled = false;
  private windowPrepareTotalMs = 0;

  setDiagnostics(enabled: boolean): void {
    this.diagnosticsEnabled = enabled;
    this.windowPrepareTotalMs = 0;
    this.feed?.setDiagnostics(enabled);
  }

  /** Readiness means coverage at this time, not merely a completed source read. */
  covers(tMs: number): boolean { return !this.feed || (this.ready && this.feed.covers(tMs)); }

  constructor(private readonly d: HostDeps) {}

  get info(): ScriptInfo | null { return this.full?.info ?? this.win?.info ?? null; }
  get styles(): Map<string, AssStyle> { return this.full?.styles ?? this.win?.styles ?? new Map(); }
  get script(): ParsedScript | null {
    if (this.full) return this.full;
    return this.win ? { ...this.win, events: this.feed?.events ?? [] } : null;
  }

  /** Loads a text (parsed whole), a `SubtitleSource` (windowed) or nothing. */
  load(input: string | SubtitleSource | null): void {
    this.drop();
    const { scene, fonts } = this.d;
    if (isSubtitleSource(input)) return this.loadSource(input);
    this.full = input ? parseScript(input) : null;
    scene().setScript(this.full);
    this.d.reset();
    fonts.setScript(input, scene().prepared, this.styles);
  }

  private loadSource(src: SubtitleSource): void {
    const { fonts } = this.d;
    const token = this.token;
    this.win = src.script;
    this.feed = new WindowFeed(src, { onChange: (a, r) => this.onWindow(a, r), onError: (e) => this.d.error(e) }, this.d.windowSeconds());
    this.feed.setDiagnostics(this.diagnosticsEnabled);
    this.bind();
    this.d.reset();
    const start = (text: string | null): void => {
      if (token !== this.token) return;
      fonts.setScript(text, [], src.script.styles, true);
      this.ready = true;
      this.d.changed();
    };
    (src.fontSection?.() ?? Promise.resolve(null)).then(start, () => start(null));
  }

  /** The renderer made a new Scene (container changed): hand it the current content. */
  bind(): void {
    const scene = this.d.scene();
    scene.setScript(this.full);
    if (this.feed) {
      const f = this.feed;
      scene.covers = (t) => this.ready && f.covers(t);
      scene.setWindow(f.events, f.events, [], this.win!);
    }
  }

  /** Called on every draw with the integer ms about to be drawn. */
  update(tMs: number): void {
    if (this.ready) this.feed?.update(tMs);
  }

  stats(): SourceStatsReport {
    if (this.feed) return { ...this.feed.stats(), ...(this.diagnosticsEnabled ? { windowPrepareTotalMs: this.windowPrepareTotalMs } : {}) };
    return { ...EMPTY, windowEvents: this.full?.events.length ?? 0 };
  }

  dispose(): void { this.drop(); }

  private onWindow(added: AssEvent[], removed: number[]): void {
    const feed = this.feed;
    if (!feed || !this.win) return;
    const start = this.diagnosticsEnabled ? performance.now() : 0;
    const fresh = this.d.scene().setWindow(feed.events, added, removed, this.win);
    this.d.fonts.extendUsage(collectUsage(fresh, this.win.styles), removed);
    if (this.diagnosticsEnabled) this.windowPrepareTotalMs += performance.now() - start;
    this.d.changed();
  }

  private drop(): void {
    this.windowPrepareTotalMs = 0;
    this.token++;
    this.feed?.dispose();
    [this.feed, this.win, this.full, this.ready] = [null, null, null, false];
  }
}
