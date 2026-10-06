import type { AssEvent } from '../types/script';
import type { SourceScript, SourceStats } from './types';

/** Messages main thread -> source worker. */
export type ToWorker =
  | { op: 'open'; id: number; blob: Blob; kind?: 'ass' | 'xpar' | 'par' }
  | { op: 'read'; id: number; t0: number; t1: number }
  | { op: 'warm'; t0: number; t1: number }
  | { op: 'fonts'; id: number }
  | { op: 'cancel'; id: number }
  | { op: 'close' };

/** Messages source worker -> main thread. */
export type FromWorker =
  | { op: 'progress'; id: number; bytes: number; total: number }
  | { op: 'opened'; id: number; kind: string; script: SourceScript; duration: number; eventCount: number; stats: SourceStats }
  | { op: 'window'; id: number; events: AssEvent[]; stats: SourceStats }
  | { op: 'fonts'; id: number; text: string | null }
  | { op: 'error'; id: number; message: string; code?: string };
