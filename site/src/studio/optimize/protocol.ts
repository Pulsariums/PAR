import type { OptimizeMode, OptimizeStats } from '../../../../src/optimize';

export type ToOptimizeWorker =
  | { op: 'run'; id: number; text: string; fps: number; mode: OptimizeMode }
  | { op: 'cancel'; id: number };

export type FromOptimizeWorker =
  | { op: 'progress'; id: number; fraction: number }
  | { op: 'done'; id: number; text: string; stats: OptimizeStats; ms: number }
  | { op: 'error'; id: number; message: string; aborted: boolean };
