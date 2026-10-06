import { XparError, type XparErrorCode } from '../format/errors';
import type { AssEvent } from '../types/script';
import { openSource, type SourceKind } from './open';
import type { FromWorker, ToWorker } from './protocol';
import type { SourceStats, SubtitleSource } from './types';

export interface WorkerSourceOptions {
  /** A Worker running `pulsar-ass-renderer/worker`, or a function that creates one (e.g. `() => new Worker(new URL(...), { type: 'module' })`). */
  worker?: Worker | (() => Worker) | null;
  kind?: SourceKind;
  onProgress?: (bytes: number, total: number) => void;
  signal?: AbortSignal;
}

const abortError = (): XparError => new XparError('ABORTED', 'opening was cancelled');

/**
 * Opens a Blob in a Worker: indexing, window reads and decoding all happen there, the main thread only receives ready
 * events. Without a usable Worker (none given, or it cannot be created) it falls back to `openSource` on this thread,
 * which still reads asynchronously in chunks. Closing the returned source terminates a Worker that was created from a factory.
 */
export const openSourceInWorker = async (blob: Blob, opts: WorkerSourceOptions = {}): Promise<SubtitleSource> => {
  let worker: Worker | null = null;
  let owned = false;
  try {
    worker = typeof opts.worker === 'function' ? opts.worker() : opts.worker ?? null;
    owned = typeof opts.worker === 'function';
  } catch { worker = null; }
  if (!worker) return openSource(blob, { kind: opts.kind, onProgress: opts.onProgress, signal: opts.signal });
  const w = worker;
  let seq = 0;
  const waiting = new Map<number, { ok: (m: FromWorker) => void; err: (e: Error) => void }>();
  let last: SourceStats = { bytesRead: 0, decodeMs: 0 };
  const post = (m: ToWorker): void => w.postMessage(m);
  w.addEventListener('message', (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    if (m.op === 'progress') { opts.onProgress?.(m.bytes, m.total); return; }
    if (m.op === 'window' || m.op === 'opened') last = m.stats;
    const p = waiting.get(m.id);
    if (!p) return;
    if (m.op === 'error') { waiting.delete(m.id); p.err(new XparError((m.code as XparErrorCode) ?? 'IO', m.message)); } else { waiting.delete(m.id); p.ok(m); }
  });
  w.addEventListener('error', (e) => { waiting.forEach((p) => p.err(new Error(e.message || 'source worker failed'))); waiting.clear(); });
  const ask = <T extends FromWorker>(m: ToWorker & { id: number }, signal?: AbortSignal): Promise<T> =>
    new Promise<T>((ok, err) => {
      if (signal?.aborted) return err(abortError());
      waiting.set(m.id, { ok: ok as (m: FromWorker) => void, err });
      signal?.addEventListener('abort', () => { if (waiting.delete(m.id)) { post({ op: 'cancel', id: m.id }); err(abortError()); } }, { once: true });
      post(m);
    });
  const close = (): void => { post({ op: 'close' }); if (owned) w.terminate(); };
  let opened: Extract<FromWorker, { op: 'opened' }>;
  try {
    opened = await ask({ op: 'open', id: ++seq, blob, kind: opts.kind }, opts.signal);
  } catch (e) {
    close();
    throw e;
  }
  return {
    kind: opened.kind,
    script: opened.script,
    duration: opened.duration,
    eventCount: opened.eventCount,
    readWindow: async (t0, t1, signal) => (await ask<Extract<FromWorker, { op: 'window' }>>({ op: 'read', id: ++seq, t0, t1 }, signal)).events as AssEvent[],
    prefetch: (t0, t1) => post({ op: 'warm', t0, t1 }),
    fontSection: async () => (await ask<Extract<FromWorker, { op: 'fonts' }>>({ op: 'fonts', id: ++seq })).text,
    stats: () => last,
    close,
  };
};
