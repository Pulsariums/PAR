import { AssIndex, indexAss } from './assIndex';
import { encodeXpar } from './encodeApi';

export interface XparEstimate {
  /** Always true: an extrapolation from sample slices, not a measurement. */
  isEstimate: true;
  approxBytes: number;
  /** ~95 % interval from the spread of the samples (not a guarantee). */
  lowBytes: number;
  highBytes: number;
  marginPct: number;
  sampledBytes: number;
  sampledFraction: number;
  samples: number;
}

/**
 * Size of the `.xpar` without encoding the whole file: encodes `samples` evenly spread slices of the file (>= ~512 KiB of
 * event lines each) and scales by event bytes. Every sample starts with a cold model, which biases the result slightly high;
 * the margin reflects the spread between samples only. For exact numbers encode the file (`encodeXpar`).
 */
export const estimateXpar = async (source: AssIndex | Blob | Uint8Array | string, samples = 6): Promise<XparEstimate> => {
  const ix = source instanceof AssIndex ? source : await indexAss(typeof source === 'string' ? new Blob([source]) : new Blob([source as BlobPart]));
  const runs = ix.ranges;
  const total = runs.reduce((n, r) => n + r.len, 0);
  const groups: number[][] = [];
  let cur: number[] = [];
  let acc = 0;
  runs.forEach((r, i) => {
    cur.push(i);
    acc += r.len;
    if (acc >= 512 * 1024) { groups.push(cur); cur = []; acc = 0; }
  });
  if (cur.length) groups.push(cur);
  const pick = groups.length <= samples ? groups : Array.from({ length: samples }, (_v, k) => groups[Math.floor(((k + 0.5) * groups.length) / samples)]);
  const enc = new TextEncoder();
  const overhead = (await encodeXpar(enc.encode(`${ix.header}\n`))).length;
  let sOut = 0;
  let sSrc = 0;
  const per: number[] = [];
  for (const g of pick) {
    let text = '';
    let n = 0;
    for (const i of g) { text += await ix.rangeText(i); n += runs[i].len; }
    const out = Math.max(0, (await encodeXpar(enc.encode(`${ix.header}\n${text}`))).length - overhead);
    sOut += out;
    sSrc += n;
    per.push(out / n);
  }
  const mean = sSrc ? sOut / sSrc : 0;
  const sd = Math.sqrt(per.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, per.length - 1));
  const margin = per.length > 1 && mean > 0 ? Math.min(1, (1.96 * sd) / Math.sqrt(per.length) / mean) : 1;
  return {
    isEstimate: true,
    approxBytes: Math.round(overhead + mean * total),
    lowBytes: Math.round(overhead + mean * (1 - margin) * total),
    highBytes: Math.round(overhead + mean * (1 + margin) * total),
    marginPct: +(margin * 100).toFixed(1),
    sampledBytes: sSrc,
    sampledFraction: total ? +(sSrc / total).toFixed(4) : 0,
    samples: pick.length,
  };
};
