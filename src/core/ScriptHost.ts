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
  timeMs(): number;
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
  private pending: { feed: WindowFeed; win: SourceScript; token: number; fontText: string | null; fontReady: boolean; skipFirstUpdate: boolean } | null = null;

  setDiagnostics(enabled: boolean): void {
    this.diagnosticsEnabled = enabled;
    this.windowPrepareTotalMs = 0;
    this.feed?.setDiagnostics(enabled);
    this.pending?.feed.setDiagnostics(enabled);
  }

  /** Readiness means coverage at this time, not merely a completed source read. */
  covers(tMs: number): boolean {
    if (this.pending) return this.pending.fontReady && this.pending.feed.covers(tMs);
    return !this.feed || (this.ready && this.feed.covers(tMs));
  }

  constructor(private readonly d: HostDeps) {}

  get info(): ScriptInfo | null { return this.pending?.win.info ?? this.full?.info ?? this.win?.info ?? null; }
  get styles(): Map<string, AssStyle> { return this.pending?.win.styles ?? this.full?.styles ?? this.win?.styles ?? new Map(); }

  /** Duration of the loaded source, seconds; zero when none is loaded. */
  get sourceDuration(): number { return this.pending?.feed.source.duration ?? this.feed?.source.duration ?? this.full?.events.reduce((m, e) => Math.max(m, e.end), 0) ?? 0; }
  get script(): ParsedScript | null {
    if (this.full) return this.full;
    return this.win ? { ...this.win, events: this.feed?.events ?? [] } : null;
  }

  /** Loads a text (parsed whole), a `SubtitleSource` (windowed) or nothing. */
  load(input: string | SubtitleSource | null): void {
    this.token++;
    this.pending?.feed.dispose();
    this.pending = null;
    const { scene, fonts } = this.d;
    if (isSubtitleSource(input)) return this.loadSource(input);
    this.feed?.dispose();
    [this.feed, this.win, this.full, this.ready] = [null, null, input ? parseScript(input) : null, false];
    scene().setScript(this.full);
    this.d.reset();
    fonts.setScript(input, scene().prepared, this.styles);
  }

  private loadSource(src: SubtitleSource): void {
    const token = this.token;
    const feed = new WindowFeed(src, { onChange: (a, r) => this.onWindow(a, r, feed), onError: (e) => this.d.error(e) }, this.d.windowSeconds());
    feed.setDiagnostics(this.diagnosticsEnabled);
    const win = src.script;
    this.pending = { feed, win, token, fontText: null, fontReady: false, skipFirstUpdate: true };
    this.d.reset();
    this.d.fonts.setScript(null, [], win.styles, true);
    const finishFonts = (text: string | null): void => {
      const p = this.pending;
      if (!p || p.token !== token || token !== this.token) { feed.dispose(); return; }
      p.fontText = text;
      p.fontReady = true;
      this.d.fonts.setScript(text, [], win.styles, true);
      this.commitPending();
    };
    (src.fontSection?.() ?? Promise.resolve(null)).then(finishFonts, () => finishFonts(null));
  }

  /** The renderer made a new Scene (container changed): hand it the current content. */
  bind(preserveSprites = false): void {
    const scene = this.d.scene();
    scene.setScript(this.full, preserveSprites);
    if (this.feed) {
      const f = this.feed;
      scene.covers = (t) => this.ready && f.covers(t);
      scene.setWindow(f.events, f.events, [], this.win!);
    }
  }

  /** Called on every draw with the integer ms about to be drawn. */
  update(tMs: number): void {
    if (this.pending) {
      const p = this.pending;
      if (p.skipFirstUpdate && tMs === 0) p.skipFirstUpdate = false;
      else p.feed.update(tMs);
      this.commitPending(tMs);
      return;
    }
    if (this.ready) this.feed?.update(tMs);
  }

  /** Loads all events of a parsed text source: preparation can then walk the whole timeline. */
  prepareSource(tMs: number): void {
    if (this.full && !this.feed) {
      if (!this.ready) { this.ready = true; this.d.changed(); }
      return;
    }
    if (this.ready) this.feed?.prepare(tMs);
  }

  stats(): SourceStatsReport {
    const feed = this.pending?.feed ?? this.feed;
    if (feed) return { ...feed.stats(), ...(this.diagnosticsEnabled ? { windowPrepareTotalMs: this.windowPrepareTotalMs } : {}) };
    return { ...EMPTY, windowEvents: this.full?.events.length ?? 0 };
  }

  dispose(): void { this.drop(); }

  private onWindow(added: AssEvent[], removed: number[], feed: WindowFeed): void {
    if (feed === this.feed) {
      if (!this.win) return;
      const start = this.diagnosticsEnabled ? performance.now() : 0;
      const fresh = this.d.scene().setWindow(feed.events, added, removed, this.win);
      this.d.fonts.extendUsage(collectUsage(fresh, this.win.styles), removed);
      if (this.diagnosticsEnabled) this.windowPrepareTotalMs += performance.now() - start;
      this.d.changed();
      return;
    }
    if (this.pending?.feed === feed) this.commitPending(this.d.timeMs(), added, removed);
  }

  private commitPending(tMs = this.d.timeMs(), added: readonly AssEvent[] = [], removed: readonly number[] = []): void {
    const p = this.pending;
    if (!p) return;
    if (p.token !== this.token) { p.feed.dispose(); this.pending = null; return; }
    if (!p.fontReady || !p.feed.covers(tMs)) return;
    this.pending = null;
    this.feed?.dispose();
    [this.feed, this.win, this.full, this.ready] = [p.feed, p.win, null, true];
    const start = this.diagnosticsEnabled ? performance.now() : 0;
    this.bind(true);
    const fresh = this.d.scene().prepared;
    this.d.fonts.extendUsage(collectUsage(fresh, p.win.styles), removed);
    if (this.diagnosticsEnabled) this.windowPrepareTotalMs += performance.now() - start;
    this.d.changed();
  }

  private drop(): void {
    this.windowPrepareTotalMs = 0;
    this.token++;
    this.pending?.feed.dispose();
    this.pending = null;
    this.feed?.dispose();
    [this.feed, this.win, this.full, this.ready] = [null, null, null, false];
  }
}
