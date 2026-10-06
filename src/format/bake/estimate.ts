import { AssIndex, indexAss } from '../assIndex';

import { bakePar, type ParParams } from './bakePar';

export interface ParEstimate {
  /** Always true: this is an extrapolation from sample windows, not a measurement. */
  isEstimate: true;
  approxBytes: number;
  /** ~95 % interval from the spread of the samples (not a guarantee). */
  lowBytes: number;
  highBytes: number;
  marginPct: number;
  eventsTotal: number;
  droppedEvents: number;
  /** Events merged into a neighbour (consecutive identical frames). */
  mergedFrames: number;
  collapsedAnimations: number;
  sampledEvents: number;
  sampledBytes: number;
  sampledFraction: number;
  samples: number;
}

/**
 * Size of the `.par` for `params` without baking the whole file: bakes `samples` evenly spread slices of the file
 * (>= ~512 KiB of event lines each) and scales by event bytes. Error sources: sample variance (reflected in the
 * margin), cold model start in every sample (biases slightly high), merges across slice borders (missed).
 */
export const estimatePar = async (source: AssIndex | Blob | Uint8Array | string, params: ParParams, samples = 8): Promise<ParEstimate> => {
  const ix = source instanceof AssIndex ? source : await indexAss(typeof source === 'string' ? new Blob([source]) : new Blob([source as BlobPart]));
  const runs = ix.ranges;
  const totalBytes = runs.reduce((n, r) => n + r.len, 0);
  const groups: number[][] = [];
  let cur: number[] = [];
  let acc = 0;
  runs.forEach((r, i) => {
    cur.push(i);
    acc += r.len;
    if (acc >= 512 * 1024) {
      groups.push(cur);
      cur = [];
      acc = 0;
    }
  });
  if (cur.length) groups.push(cur);
  const pick = groups.length <= samples ? groups : Array.from({ length: samples }, (_v, k) => groups[Math.floor(((k + 0.5) * groups.length) / samples)]);
  const overhead = (await bakePar(`${ix.header}\n`, params)).bytes.length;
  let sBytes = 0;
  let sSrc = 0;
  let sEvents = 0;
  const st = { dropped: 0, merged: 0, collapsed: 0 };
  const perByte: number[] = [];
  for (const g of pick) {
    let text = '';
    let n = 0;
    for (const i of g) {
      text += await ix.rangeText(i);
      n += runs[i].len;
    }
    const r = await bakePar(`${ix.header}\n${text}`, params);
    const out = Math.max(0, r.bytes.length - overhead);
    sBytes += out;
    sSrc += n;
    sEvents += r.stats.eventsIn;
    st.dropped += r.stats.dropped;
    st.merged += r.stats.merged;
    st.collapsed += r.stats.collapsed;
    perByte.push(out / n);
  }
  const mean = sSrc ? sBytes / sSrc : 0;
  const sd = Math.sqrt(perByte.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, perByte.length - 1));
  const margin = perByte.length > 1 && mean > 0 ? Math.min(1, (1.96 * sd) / Math.sqrt(perByte.length) / mean) : 1;
  const approx = overhead + mean * totalBytes;
  const scale = sEvents ? ix.data.events / sEvents : 0;
  return {
    isEstimate: true,
    approxBytes: Math.round(approx),
    lowBytes: Math.round(overhead + mean * (1 - margin) * totalBytes),
    highBytes: Math.round(overhead + mean * (1 + margin) * totalBytes),
    marginPct: +(margin * 100).toFixed(1),
    eventsTotal: ix.data.events,
    droppedEvents: Math.round(st.dropped * scale),
    mergedFrames: Math.round(st.merged * scale),
    collapsedAnimations: Math.round(st.collapsed * scale),
    sampledEvents: sEvents,
    sampledBytes: sSrc,
    sampledFraction: totalBytes ? +(sSrc / totalBytes).toFixed(4) : 0,
    samples: pick.length,
  };
};
