/** A run of consecutive event lines in the original file. */
export interface AssRange {
  off: number;
  len: number;
  minStartMs: number;
  maxEndMs: number;
  /** Dialogue ordinal of the first Dialogue line of the run. */
  ord0: number;
  fmt: number;
  count: number;
}

export interface AssIndexOptions {
  /** Close a run after this many bytes (default 256 KiB). */
  rangeBytes?: number;
  /** Events at least this long (ms) get runs of their own so they do not widen the short runs (default 20 s). */
  longMs?: number;
  maxHeaderBytes?: number;
  /** Bytes consumed so far, and the file size (after each slice). */
  onProgress?: (bytesRead: number, total: number) => void;
  /** Rejects with XparError('ABORTED'). */
  signal?: AbortSignal;
}

export interface AssIndexData {
  ranges: AssRange[];
  header: string;
  formats: string[];
  durationMs: number;
  events: number;
  bytes: number;
  /** Byte range of the `[Fonts]` section, or null. */
  fonts: { off: number; len: number } | null;
}
