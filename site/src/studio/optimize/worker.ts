import { optimizeAss } from '../../../../src/optimize';

import type { FromOptimizeWorker, ToOptimizeWorker } from './protocol';

const jobs = new Map<number, AbortController>();
const post = (m: FromOptimizeWorker): void => (self as unknown as Worker).postMessage(m);

self.addEventListener('message', (e: MessageEvent<ToOptimizeWorker>) => {
  const m = e.data;
  if (m.op === 'cancel') { jobs.get(m.id)?.abort(); return; }
  const ac = new AbortController();
  jobs.set(m.id, ac);
  const t0 = performance.now();
  optimizeAss(m.text, { fps: m.fps, mode: m.mode, signal: ac.signal, onProgress: (fraction) => post({ op: 'progress', id: m.id, fraction }) })
    .then((r) => post({ op: 'done', id: m.id, text: r.text, stats: r.stats, ms: Math.round(performance.now() - t0) }))
    .catch((err: unknown) => post({ op: 'error', id: m.id, message: err instanceof Error ? err.message : String(err), aborted: ac.signal.aborted }))
    .finally(() => jobs.delete(m.id));
});
