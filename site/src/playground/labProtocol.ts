/** Messages between the Lab and its size worker (XPAR / PAR encode and estimates). */
export type JobKind = 'xpar' | 'par' | 'estXpar' | 'estPar';

export type ToSizeWorker =
  | { op: 'open'; blob: Blob }
  | { op: 'job'; id: number; kind: JobKind; fps?: number }
  | { op: 'cancel'; id: number }
  | { op: 'gen'; id: number; targetBytes: number };

export interface SizeResult {
  exact: boolean;
  bytes: number;
  low?: number;
  high?: number;
  marginPct?: number;
  /** The encoded file (exact results only). */
  blob?: Blob;
  ms: number;
  /** PAR only: how much the baker changed (events dropped / merged frames / collapsed animations, extrapolated for estimates). */
  notes?: { dropped: number; merged: number; collapsed: number };
}

export type FromSizeWorker =
  | { op: 'progress'; id: number; fraction: number | null }
  | { op: 'done'; id: number; result: SizeResult }
  | { op: 'generated'; id: number; blob: Blob; ms: number }
  | { op: 'error'; id: number; message: string; aborted: boolean };
