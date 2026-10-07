import type { SniffKind } from '../../../src/format';

import { actionsFor, outputName, type Action } from './plan';
import type { ConvertDone, Phase } from './protocol';

export type Status = 'ready' | 'queued' | 'running' | 'done' | 'error';

export interface Item {
  id: number;
  name: string;
  size: number;
  kind: SniffKind;
  status: Status;
  action: Action | null;
  fps: number;
  verify: boolean;
  /** Fonts to store with the output (XPAR / PAR), chosen when it was queued. */
  fonts: File[];
  /** 0..1, null = unknown (indeterminate). */
  progress: number | null;
  phase: Phase;
  /** Error message (status `error`), or the reason a file cannot be converted (status `error`, no action). */
  error: string;
  outName: string;
  result: ConvertDone | null;
}

/** Queue state of the converter card: immutable list, pure transitions (the runner and the DOM live elsewhere). Files run one at a time, in order. */
export type Queue = readonly Item[];

const patch = (q: Queue, id: number, p: Partial<Item>): Queue => q.map((i) => (i.id === id ? { ...i, ...p } : i));

export const addItem = (q: Queue, id: number, file: { name: string; size: number }, kind: SniffKind, error = ''): Queue => {
  const bad = kind === 'unknown' || file.size === 0 || !!error;
  return [...q, { id, name: file.name, size: file.size, kind, status: bad ? 'error' : 'ready', action: null, fps: 24, verify: false, fonts: [], progress: 0, phase: 'encode', error, outName: '', result: null }];
};

/** Queues a conversion; ignored when the kind cannot do that action or the file is already queued / running. */
export const enqueue = (q: Queue, id: number, action: Action, fps: number, verify: boolean, fonts: File[] = []): Queue => {
  const it = q.find((i) => i.id === id);
  if (!it || (it.status !== 'ready' && it.status !== 'done' && it.status !== 'error') || !actionsFor(it.kind).includes(action)) return q;
  return patch(q, id, { status: 'queued', action, fps, verify, fonts, progress: 0, phase: 'encode', error: '', outName: outputName(action, it.name, it.kind, fps), result: null });
};

/** The next file to run, or null while one is running or nothing is queued. */
export const nextToRun = (q: Queue): Item | null => (q.some((i) => i.status === 'running') ? null : (q.find((i) => i.status === 'queued') ?? null));

export const start = (q: Queue, id: number): Queue => patch(q, id, { status: 'running', progress: 0 });
export const progress = (q: Queue, id: number, fraction: number | null, phase: Phase): Queue => patch(q, id, { progress: fraction, phase });
export const finish = (q: Queue, id: number, result: ConvertDone): Queue => patch(q, id, { status: 'done', progress: 1, result });
export const fail = (q: Queue, id: number, message: string): Queue => patch(q, id, { status: 'error', error: message, result: null });
/** Cancel of a queued or running file: back to "ready" so the user can choose again. */
export const cancel = (q: Queue, id: number): Queue => patch(q, id, { status: 'ready', progress: 0, action: null, error: '' });
export const remove = (q: Queue, id: number): Queue => q.filter((i) => i.id !== id);
export const isBusy = (q: Queue): boolean => q.some((i) => i.status === 'queued' || i.status === 'running');
