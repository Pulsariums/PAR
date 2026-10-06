import { Sha256, bakePar, decodeXparTo, encodeXparTo, openXpar, parHeader, toHex, FILE_TYPES } from '../../../src/format';

import type { ConvertDone, ConvertRequest, FromConvertWorker, Phase } from './protocol';

const ctx = self as unknown as { postMessage(m: FromConvertWorker): void; onmessage: ((e: MessageEvent<ConvertRequest>) => void) | null };
const progress = (fraction: number | null, phase: Phase): void => ctx.postMessage({ op: 'progress', fraction, phase });
const mismatch = (): Error => new Error('verification failed: the decoded text differs from the input (SHA-256 mismatch). Nothing was produced.');

/** Streams a Blob through SHA-256 (never the whole file in one buffer). */
const hashBlob = async (blob: Blob): Promise<string> => {
  const h = new Sha256();
  const r = blob.stream().getReader();
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    h.update(value);
  }
  return toHex(h.digest());
};

/** Decodes a container to ASS; returns the text parts and the SHA-256 of what was written. `expected` (bytes, or 'source' = the size recorded in a lossless file) sizes the progress bar. */
const decode = async (blob: Blob, expected: number | 'source', phase: Phase, scale: [number, number]): Promise<{ parts: Uint8Array[]; sha: string; lossy: boolean; header: ReturnType<typeof parHeader> }> => {
  const file = await openXpar(blob);
  const header = parHeader(file);
  const total = expected === 'source' ? (header.lossy ? null : header.sourceBytes) : expected;
  const h = new Sha256();
  const parts: Uint8Array[] = [];
  let n = 0;
  await decodeXparTo(file, (b) => {
    h.update(b);
    parts.push(b.slice());
    n += b.length;
    progress(total ? scale[0] + (scale[1] - scale[0]) * Math.min(1, n / total) : null, phase);
  });
  return { parts, sha: toHex(h.digest()), lossy: header.lossy, header };
};

const toXpar = async (req: ConvertRequest): Promise<ConvertDone> => {
  const t0 = performance.now();
  const parts: Uint8Array[] = [];
  const share = req.verify ? 0.5 : 1;
  await encodeXparTo(req.blob, (b) => void parts.push(b.slice()), { totalBytes: req.blob.size, onProgress: (p) => progress(p.fraction === null ? null : p.fraction * share, 'encode') });
  const out = new Blob(parts as BlobPart[], { type: FILE_TYPES.xpar.mime });
  if (req.verify) {
    const want = await hashBlob(req.blob);
    const back = await decode(out, req.blob.size, 'verify', [0.5, 1]);
    if (back.sha !== want) throw mismatch();
  }
  return { blob: out, ms: performance.now() - t0, verified: req.verify ? 'ok' : 'none' };
};

const toPar = async (req: ConvertRequest): Promise<ConvertDone> => {
  const t0 = performance.now();
  const { bytes, stats } = await bakePar(req.blob, { fps: req.fps }, { totalBytes: req.blob.size, onProgress: (p) => progress(p.fraction, 'encode') });
  return { blob: new Blob([bytes as BlobPart], { type: FILE_TYPES.par.mime }), ms: performance.now() - t0, verified: 'none', notes: { dropped: stats.dropped, merged: stats.merged, collapsed: stats.collapsed } };
};

/** XPAR -> the original ASS, checked against the SHA-256 stored in the file; PAR -> the baked ASS (its stored hash belongs to the original, so no check). */
const toAss = async (req: ConvertRequest): Promise<ConvertDone> => {
  const t0 = performance.now();
  const { parts, sha, lossy, header } = await decode(req.blob, 'source', 'encode', [0, 1]);
  if (!lossy && header.sourceSha256 && sha !== header.sourceSha256) throw mismatch();
  return { blob: new Blob(parts as BlobPart[], { type: FILE_TYPES.ass.mime }), ms: performance.now() - t0, verified: lossy ? 'none' : 'ok' };
};

ctx.onmessage = (e) => {
  const req = e.data;
  const job = req.action === 'xpar' ? toXpar : req.action === 'par' ? toPar : toAss;
  job(req).then(
    (result) => ctx.postMessage({ op: 'done', result }),
    (err: unknown) => ctx.postMessage({ op: 'error', message: err instanceof Error ? err.message : String(err) }),
  );
};
