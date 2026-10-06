import { XparError } from '../format/errors';
import { openSource } from './open';
import type { FromWorker, ToWorker } from './protocol';
import type { SubtitleSource } from './types';

/** The part of a worker global scope the host needs (also satisfied by a test double). */
export interface HostScope {
  postMessage(m: FromWorker): void;
  addEventListener(type: 'message', fn: (e: { data: ToWorker }) => void): void;
}

/**
 * Serves one `SubtitleSource` over messages: open (with progress), read windows (cancellable), warm, font section.
 * Runs inside the Worker built from `worker.ts`; takes any scope so it can be tested without a real Worker.
 */
export const attachSourceHost = (scope: HostScope): void => {
  let source: SubtitleSource | null = null;
  const aborts = new Map<number, AbortController>();
  const fail = (id: number, e: unknown): void => {
    scope.postMessage({ op: 'error', id, message: e instanceof Error ? e.message : String(e), code: e instanceof XparError ? e.code : undefined });
  };
  const stats = () => source?.stats?.() ?? { bytesRead: 0, decodeMs: 0 };
  scope.addEventListener('message', ({ data: m }) => {
    if (m.op === 'open') {
      const ac = new AbortController();
      aborts.set(m.id, ac);
      openSource(m.blob, { kind: m.kind, signal: ac.signal, onProgress: (bytes, total) => scope.postMessage({ op: 'progress', id: m.id, bytes, total }) })
        .then((s) => {
          source = s;
          scope.postMessage({ op: 'opened', id: m.id, kind: s.kind, script: s.script, duration: s.duration, eventCount: s.eventCount, stats: stats() });
        }, (e) => fail(m.id, e))
        .finally(() => aborts.delete(m.id));
    } else if (m.op === 'read' && source) {
      const ac = new AbortController();
      aborts.set(m.id, ac);
      source.readWindow(m.t0, m.t1, ac.signal).then((events) => {
        if (!ac.signal.aborted) scope.postMessage({ op: 'window', id: m.id, events, stats: stats() });
      }, (e) => { if (!ac.signal.aborted) fail(m.id, e); }).finally(() => aborts.delete(m.id));
    } else if (m.op === 'warm' && source) void source.readWindow(m.t0, m.t1).catch(() => undefined);
    else if (m.op === 'fonts' && source) {
      (source.fontSection?.() ?? Promise.resolve(null)).then((text) => scope.postMessage({ op: 'fonts', id: m.id, text }), (e) => fail(m.id, e));
    } else if (m.op === 'cancel') aborts.get(m.id)?.abort();
    else if (m.op === 'close') { source?.close?.(); source = null; }
  });
};
