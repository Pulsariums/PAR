import type { ConvertDone, ConvertRequest, FromConvertWorker, Phase } from './protocol';

export interface Run {
  promise: Promise<ConvertDone>;
  /** Terminates the worker; the promise then never settles, so the caller must ignore a cancelled run. */
  cancel(): void;
}

/** One conversion in its own module Worker: heavy work stays off the UI thread and cancel is a hard stop that frees the memory. */
export const runConvert = (req: ConvertRequest, onProgress: (fraction: number | null, phase: Phase) => void): Run => {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const promise = new Promise<ConvertDone>((ok, err) => {
    worker.addEventListener('message', (e: MessageEvent<FromConvertWorker>) => {
      const m = e.data;
      if (m.op === 'progress') { onProgress(m.fraction, m.phase); return; }
      worker.terminate();
      if (m.op === 'done') ok(m.result); else err(new Error(m.message));
    });
    worker.addEventListener('error', (e) => { worker.terminate(); err(new Error(e.message || 'worker failed')); });
    worker.postMessage(req);
  });
  return { promise, cancel: () => worker.terminate() };
};
