import { openXpar, parHeader, type ParHeader } from '../../../src/format';
import { openSourceInWorker, sniffBlob } from '../../../src/source';
import { t } from '../i18n/i18n';

import type { LabSession } from './labTypes';

/** The module Worker of the library (indexing and window decoding happen there). */
const sourceWorker = (): Worker => new Worker(new URL('../../../src/source/worker.ts', import.meta.url), { type: 'module' });

/** Sniffs a Blob (ASS / XPAR / PAR), opens it in the source Worker and reads the container header. Throws on an unknown format or abort. */
export const openSession = async (blob: Blob, name: string, opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}): Promise<LabSession> => {
  const t0 = performance.now();
  const kind = await sniffBlob(blob);
  if (kind === 'unknown') throw new Error(t('lab.fail', { error: 'not an ASS, XPAR or PAR file' }));
  const source = await openSourceInWorker(blob, { worker: sourceWorker, kind, signal: opts.signal, onProgress: opts.onProgress });
  if (opts.signal?.aborted) { source.close?.(); throw new DOMException('aborted', 'AbortError'); }
  let header: ParHeader | null = null;
  if (kind !== 'ass') header = parHeader(await openXpar(blob));
  return { name, blob, kind, source, openMs: performance.now() - t0, header };
};
