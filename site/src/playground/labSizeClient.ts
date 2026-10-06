import type { FromSizeWorker, JobKind, SizeResult, ToSizeWorker } from './labProtocol';

export interface Job<T> {
  promise: Promise<T>;
  cancel(): void;
}

export class JobCancelled extends Error {}

/** Promise API over the size worker: encode / estimate jobs with progress and cancel, and the test-file generator. */
export class SizeClient {
  private readonly worker: Worker;
  private seq = 0;
  private readonly waiting = new Map<number, { ok: (m: FromSizeWorker) => void; err: (e: Error) => void; progress?: (f: number | null) => void }>();

  constructor() {
    this.worker = new Worker(new URL('./labSizeWorker.ts', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', (e: MessageEvent<FromSizeWorker>) => {
      const m = e.data;
      const w = this.waiting.get(m.id);
      if (!w) return;
      if (m.op === 'progress') { w.progress?.(m.fraction); return; }
      this.waiting.delete(m.id);
      if (m.op === 'error') w.err(m.aborted ? new JobCancelled() : new Error(m.message));
      else w.ok(m);
    });
    this.worker.addEventListener('error', (e) => { this.waiting.forEach((w) => w.err(new Error(e.message))); this.waiting.clear(); });
  }

  private post(m: ToSizeWorker): void { this.worker.postMessage(m); }

  open(blob: Blob): void { this.post({ op: 'open', blob }); }

  private start<T extends FromSizeWorker>(make: (id: number) => ToSizeWorker, progress?: (f: number | null) => void): { id: number; job: Job<T> } {
    const id = ++this.seq;
    const promise = new Promise<T>((ok, err) => { this.waiting.set(id, { ok: ok as (m: FromSizeWorker) => void, err, progress }); this.post(make(id)); });
    return { id, job: { promise, cancel: () => { if (this.waiting.delete(id)) { this.post({ op: 'cancel', id }); } } } };
  }

  /** Cancel makes the promise stay pending forever, so callers must ignore a cancelled job (they hold the latest job id). */
  run(kind: JobKind, fps: number, progress?: (f: number | null) => void): Job<SizeResult> {
    const { job } = this.start<Extract<FromSizeWorker, { op: 'done' }>>((id) => ({ op: 'job', id, kind, fps }), progress);
    return { promise: job.promise.then((m) => m.result), cancel: job.cancel };
  }

  generate(targetBytes: number, progress?: (f: number | null) => void): Job<{ blob: Blob; ms: number }> {
    const { job } = this.start<Extract<FromSizeWorker, { op: 'generated' }>>((id) => ({ op: 'gen', id, targetBytes }), progress);
    return { promise: job.promise.then((m) => ({ blob: m.blob, ms: m.ms })), cancel: job.cancel };
  }

  dispose(): void { this.worker.terminate(); this.waiting.clear(); }
}
