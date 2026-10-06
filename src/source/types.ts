import type { AssEvent, AssStyle, ScriptInfo } from '../types/script';

/** Everything of a script except its events: what a renderer needs before the first window arrives. */
export interface SourceScript {
  info: ScriptInfo;
  styles: Map<string, AssStyle>;
  warnings: string[];
}

export interface SourceStats {
  /** Bytes read from the underlying file / blob / URL so far. */
  bytesRead: number;
  /** Milliseconds spent reading + decoding + parsing windows so far. */
  decodeMs: number;
  /** One-time cost of opening / indexing the source, ms (0 when there is none). */
  indexMs?: number;
}

/**
 * A subtitle the renderer can play without holding all of it. `readWindow` returns the events visible in [t0, t1)
 * seconds (half-open on integer milliseconds, see `inWindow`), in file order, with the ids and `index` values a full
 * `parseScript` of the same file would give. Implementations may be asynchronous and may live in a Worker.
 */
export interface SubtitleSource {
  readonly kind: string;
  readonly script: SourceScript;
  /** End of the last event, seconds. */
  readonly duration: number;
  /** Number of Dialogue events in the whole script. */
  readonly eventCount: number;
  readWindow(t0: number, t1: number, signal?: AbortSignal): Promise<AssEvent[]>;
  /** Hint: this range will be asked for soon (warm caches, decode in the background). Never required. */
  prefetch?(t0: number, t1: number): void;
  /** Raw text of the script's `[Fonts]` section (starting with the `[Fonts]` line), or null. */
  fontSection?(): Promise<string | null>;
  stats?(): SourceStats;
  close?(): void;
}

export const isSubtitleSource = (v: unknown): v is SubtitleSource =>
  typeof v === 'object' && v !== null && typeof (v as SubtitleSource).readWindow === 'function' && 'script' in v;
