import { analyzeAss, analyzeSource, summaryText, type AnalyzeReport } from '../../../../src/analyze';
import { openSource } from '../../../../src/source/open';

import type { FromAnalyzeWorker, ToAnalyzeWorker } from './protocol';

const jobs = new Map<number, AbortController>();
const post = (m: FromAnalyzeWorker): void => (self as unknown as Worker).postMessage(m);

/** ASS is read in the Worker (text, with frame-by-frame runs); XPAR / PAR are opened and read window by window, so nothing is scanned on the page's thread. */
const analyze = async (m: Extract<ToAnalyzeWorker, { op: 'run' }>, ac: AbortController): Promise<AnalyzeReport> => {
  const opt = { fps: m.fps, width: m.width || undefined, signal: ac.signal, onProgress: (fraction: number) => post({ op: 'progress', id: m.id, fraction }) };
  if (m.kind === 'ass') return analyzeAss(await m.blob.text(), opt);
  const source = await openSource(m.blob, { kind: m.kind, signal: ac.signal });
  try { return await analyzeSource(source, opt); } finally { source.close?.(); }
};

self.addEventListener('message', (e: MessageEvent<ToAnalyzeWorker>) => {
  const m = e.data;
  if (m.op === 'cancel') { jobs.get(m.id)?.abort(); return; }
  const ac = new AbortController();
  jobs.set(m.id, ac);
  const t0 = performance.now();
  analyze(m, ac)
    .then((report) => post({ op: 'done', id: m.id, report, text: summaryText(report), ms: Math.round(performance.now() - t0) }))
    .catch((err: unknown) => post({ op: 'error', id: m.id, message: err instanceof Error ? err.message : String(err), aborted: ac.signal.aborted }))
    .finally(() => jobs.delete(m.id));
});
