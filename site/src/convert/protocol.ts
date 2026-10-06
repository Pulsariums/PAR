import type { SniffKind } from '../../../src/format';

import type { Action } from './plan';

/** Messages between the converter card and its worker (one job per worker; cancelling terminates the worker). */
export interface ConvertRequest {
  blob: Blob;
  kind: SniffKind;
  action: Action;
  fps: number;
  /** XPAR output: decode it again and compare the SHA-256 with the input. */
  verify: boolean;
}

export type Phase = 'encode' | 'verify';

/** `ok`: the SHA-256 matched; `none`: nothing to compare (PAR output, baked ASS). A mismatch is an error, never a result. */
export type Verified = 'ok' | 'none';

export interface ConvertDone {
  blob: Blob;
  ms: number;
  verified: Verified;
  /** PAR output: what the baker changed. */
  notes?: { dropped: number; merged: number; collapsed: number };
}

export type FromConvertWorker =
  | { op: 'progress'; fraction: number | null; phase: Phase }
  | { op: 'done'; result: ConvertDone }
  | { op: 'error'; message: string };
