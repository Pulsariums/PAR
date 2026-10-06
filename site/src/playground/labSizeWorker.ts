import { AssIndex, bakePar, encodeXparTo, estimatePar, estimateXpar, indexAss } from '../../../src/format';
import { PROFILES } from '../../../tools/xpar/bench-all';

import type { FromSizeWorker, JobKind, SizeResult, ToSizeWorker } from './labProtocol';

const ctx = self as unknown as { postMessage(m: FromSizeWorker): void; onmessage: ((e: MessageEvent<ToSizeWorker>) => void) | null };
let blob: Blob | null = null;
let index: Promise<AssIndex> | null = null;
const aborts = new Map<number, AbortController>();
const cancelled = new Set<number>();
const now = (): number => performance.now();

const exact = async (id: number, kind: 'xpar' | 'par', fps: number, signal: AbortSignal): Promise<SizeResult> => {
  const t = now();
  const parts: Uint8Array[] = [];
  const opts = { signal, totalBytes: blob!.size, onProgress: (p: { fraction: number | null }) => ctx.postMessage({ op: 'progress', id, fraction: p.fraction }) };
  const sink = (b: Uint8Array): void => { parts.push(b.slice()); };
  let notes: SizeResult['notes'];
  if (kind === 'xpar') await encodeXparTo(blob!, sink, opts);
  else {
    const { bytes, stats } = await bakePar(blob!, { fps }, opts);
    parts.push(bytes);
    notes = { dropped: stats.dropped, merged: stats.merged, collapsed: stats.collapsed };
  }
  const out = new Blob(parts as BlobPart[]);
  return { exact: true, bytes: out.size, blob: out, ms: now() - t, notes };
};

const estimate = async (kind: 'estXpar' | 'estPar', fps: number): Promise<SizeResult> => {
  const t = now();
  const ix = await (index ??= indexAss(blob!));
  if (kind === 'estXpar') {
    const e = await estimateXpar(ix);
    return { exact: false, bytes: e.approxBytes, low: e.lowBytes, high: e.highBytes, marginPct: e.marginPct, ms: now() - t };
  }
  const e = await estimatePar(ix, { fps });
  return { exact: false, bytes: e.approxBytes, low: e.lowBytes, high: e.highBytes, marginPct: e.marginPct, ms: now() - t, notes: { dropped: e.droppedEvents, merged: e.mergedFrames, collapsed: e.collapsedAnimations } };
};

const run = async (id: number, kind: JobKind, fps: number): Promise<SizeResult> => {
  if (!blob) throw new Error('no file');
  if (kind === 'estXpar' || kind === 'estPar') return estimate(kind, fps);
  const ac = new AbortController();
  aborts.set(id, ac);
  try { return await exact(id, kind, fps, ac.signal); } finally { aborts.delete(id); }
};

/** Generates a test script of about `targetBytes` (the benchmark generator of tools/xpar, profile a-text-24) as a Blob. */
const generate = async (id: number, targetBytes: number): Promise<void> => {
  const t = now();
  const profile = PROFILES.find((p) => p.id === 'a-text-24')!;
  const parts: string[] = [];
  let buf = '';
  let total = 0;
  for (const piece of profile.generate(24 * 3600, 1)) {
    buf += piece;
    total += piece.length;
    if (buf.length > 4 << 20) {
      parts.push(buf);
      buf = '';
      ctx.postMessage({ op: 'progress', id, fraction: Math.min(1, total / targetBytes) });
      await new Promise((r) => setTimeout(r));
      if (cancelled.has(id)) return;
    }
    if (total >= targetBytes) break;
  }
  parts.push(buf);
  ctx.postMessage({ op: 'generated', id, blob: new Blob(parts, { type: 'text/plain' }), ms: now() - t });
};

ctx.onmessage = (e) => {
  const m = e.data;
  if (m.op === 'open') { blob = m.blob; index = null; return; }
  if (m.op === 'cancel') { cancelled.add(m.id); aborts.get(m.id)?.abort(); return; }
  if (m.op === 'gen') { void generate(m.id, m.targetBytes); return; }
  run(m.id, m.kind, m.fps ?? 24).then(
    (result) => ctx.postMessage({ op: 'done', id: m.id, result }),
    (err: unknown) => ctx.postMessage({ op: 'error', id: m.id, message: err instanceof Error ? err.message : String(err), aborted: cancelled.has(m.id) }),
  );
};

