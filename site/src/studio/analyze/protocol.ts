import type { AnalyzeReport } from '../../../../src/analyze';

export type ToAnalyzeWorker =
  | { op: 'run'; id: number; blob: Blob; kind: 'ass' | 'xpar' | 'par'; fps: number; width: number }
  | { op: 'cancel'; id: number };

export type FromAnalyzeWorker =
  | { op: 'progress'; id: number; fraction: number }
  | { op: 'done'; id: number; report: AnalyzeReport; text: string; ms: number }
  | { op: 'error'; id: number; message: string; aborted: boolean };
