import { printEvent, modelFields } from '../format/chunk';
import { frameMs, frameRate } from '../core/time';
import { parseScript } from '../parser/ScriptParser';

import { findStyle } from '../parser/StyleParser';

import { buildChains, type TolFor } from './chains';
import { emitText } from './emit';
import { toOptEvent, type OptEvent } from './events';
import { segment } from './fit';
import { placeCandidates, type Candidate, type Plain, type Spot } from './order';
import { fitAllowed, geometryOf, type Geo } from './tolerance';
import type { OptimizeOptions, OptimizeResult, OptimizeStats } from './types';
import { worstError } from './verify';

export type { OptimizeMode, OptimizeOptions, OptimizeResult, OptimizeStats } from './types';

const STANDARD = 'layer,start,end,style,name,marginl,marginr,marginv,effect,text';
const yieldNow = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

interface Planned { cand: Candidate; members: OptEvent[]; line: string }

/** Light read of a Dialogue line's layer and times (ms), also for lines the model rejects. */
const times = (line: string): { layer: number; s: number; e: number } | null => {
  const m = modelFields(line, false);
  if (m) return { layer: m.layer, s: m.startCs * 10, e: m.endCs * 10 };
  const r = /^Dialogue:\s*(\d*)[^,]*,(\d+):(\d{2}):(\d{2})\.(\d{2}),(\d+):(\d{2}):(\d{2})\.(\d{2}),/.exec(line);
  if (!r) return null;
  const t = (h: string, mi: string, s: string, c: string): number => ((+h * 60 + +mi) * 60 + +s) * 1000 + +c * 10;
  return { layer: +(r[1] || 0), s: t(r[2], r[3], r[4], r[5]), e: t(r[6], r[7], r[8], r[9]) };
};

/**
 * Rewrites runs of frame-by-frame events (same text and tags, the numbers moving a little each frame) as single events that move by
 * `\move` and `\t`. Lossy by design, and checked: every merged event is compared with the lines it replaces on every video frame, using
 * PAR's own evaluation, and thrown away (the original lines kept) if it differs by more than the tolerance of the chosen mode, or if
 * merging would change the drawing order of overlapping events. Scripts it cannot read safely are returned unchanged.
 */
export const optimizeAss = async (input: string, opt: OptimizeOptions): Promise<OptimizeResult> => {
  const mode = opt.mode ?? 'invisible';
  const minChain = Math.max(2, opt.minChain ?? 3);
  const stats: OptimizeStats = { eventsIn: 0, eventsOut: 0, chains: 0, merged: 0, removed: 0, rejected: 0, orderConflicts: 0, worstError: 0 };
  const crlf = input.includes('\r\n');
  const lines = input.split(/\r?\n/);
  const isDialogue = (l: string): boolean => l.startsWith('Dialogue: ');
  stats.eventsIn = lines.filter(isDialogue).length;
  stats.eventsOut = stats.eventsIn;
  const unchanged = (): OptimizeResult => ({ text: input, stats });

  // Only the standard V4+ event layout is read.
  let inEvents = false, standard = true;
  for (const l of lines) {
    const t = l.trim().toLowerCase();
    if (t.startsWith('[')) inEvents = t === '[events]';
    else if (inEvents && t.startsWith('format:') && t.slice(7).split(',').map((x) => x.trim()).join(',') !== STANDARD) standard = false;
  }
  if (!standard || stats.eventsIn === 0) return unchanged();

  const script = parseScript(lines.filter((l) => !isDialogue(l) && !l.startsWith('Comment: ')).join('\n'));
  const rate = frameRate(opt.fps);
  const styleOf = (e: OptEvent) => findStyle(script.styles, e.m.style);
  const tolWith = (kinds: OptEvent['kinds'], geo: Geo) => (slot: number, v: number): number => fitAllowed(kinds[slot], v, geo, mode);
  const tolFor: TolFor = (kinds, sample) => tolWith(kinds, geometryOf([sample], styleOf(sample)));
  const events: OptEvent[] = [];
  const plain: Plain[] = [];
  const spotOf = (e: OptEvent, geo: Geo): Spot | undefined => {
    const p = e.parts.find((x) => x.how === 'pos');
    return p && Number.isFinite(geo.reach) ? { x: e.vals[p.at], y: e.vals[p.at + 1], r: geo.reach } : undefined;
  };
  const spots = new Map<number, Spot | undefined>();
  lines.forEach((l, i) => {
    if (!isDialogue(l)) return;
    const t = times(l);
    const e = toOptEvent(l, i);
    if (e) { events.push(e); spots.set(i, spotOf(e, geometryOf([e], styleOf(e)))); }
    if (t) plain.push({ layer: t.layer, s: t.s, e: t.e, line: i, owner: -1, spot: spots.get(i) });
  });

  // The video frames each event is shown on (the picture the result is judged by): frame instants in integer ms, half-open like PAR's visibility.
  const frameCache = new Map<number, number[]>();
  const framesFor = (e: OptEvent): number[] => {
    let out = frameCache.get(e.line);
    if (out) return out;
    out = [];
    const s = e.m.startCs * 10, end = e.m.endCs * 10;
    let k = Math.max(0, Math.floor((s * rate.num) / (1000 * rate.den)) - 1);
    while (frameMs(k, rate) < s) k++;
    for (; frameMs(k, rate) < end; k++) out.push(frameMs(k, rate));
    frameCache.set(e.line, out);
    return out;
  };

  const chains = buildChains(events, tolFor, minChain);
  stats.chains = chains.length;
  const planned: Planned[] = [];
  const cands: Candidate[] = [];
  let done = 0;
  for (const chain of chains) {
    if (opt.signal?.aborted) throw Object.assign(new Error('optimize cancelled'), { name: 'AbortError' });
    if (++done % 200 === 0) { opt.onProgress?.(done / chains.length); await yieldNow(); }
    const frames = chain.map(framesFor);
    const geo = geometryOf(chain, styleOf(chain[0]));
    const ctx = { styles: script.styles, info: script.info, geo, mode };
    for (const seg of segment(chain, frames, tolWith(chain[0].kinds, geo))) {
      if (seg.b === seg.a || !seg.lines) continue;
      const members = chain.slice(seg.a, seg.b + 1);
      const startCs = members[0].m.startCs, endCs = members[members.length - 1].m.endCs;
      const seen = frames.slice(seg.a, seg.b + 1).flat();
      const text = emitText(members, seg.lines, startCs * 10, seen[0], seen[seen.length - 1], geo, mode);
      const merged = printEvent(false, { ...members[0].m, startCs, endCs, text });
      const err = worstError(members.map((e, i) => ({ line: lines[e.line], frames: frames[seg.a + i] })), merged, ctx);
      if (!(err <= 1)) { stats.rejected++; continue; }
      stats.worstError = Math.max(stats.worstError, err);
      const ls = members.map((e) => e.line);
      const cand: Candidate = {
        id: cands.length, layer: members[0].m.layer, first: Math.min(...ls), span: Math.max(...ls) - Math.min(...ls),
        members: members.map((e) => ({ s: e.m.startCs * 10, e: e.m.endCs * 10, line: e.line, spot: spotOf(e, geo) })),
      };
      cands.push(cand);
      planned.push({ cand, members, line: merged });
    }
  }

  // Drawing order: events of one layer are drawn in file order; a merged event sits where its first frame was.
  const owner = new Map<number, number>();
  for (const c of cands) for (const m of c.members) owner.set(m.line, c.id);
  for (const p of plain) p.owner = owner.get(p.line) ?? -1;
  const { drop, at } = placeCandidates(cands, plain);
  stats.orderConflicts = drop.size;

  const place = new Map<number, number>();
  const replace = new Map<number, string>();
  const remove = new Set<number>();
  for (const p of planned) {
    if (drop.has(p.cand.id)) continue;
    place.set(p.cand.id, at.get(p.cand.id)!);
    replace.set(p.cand.id, p.line);
    for (const m of p.members) remove.add(m.line);
    stats.merged++;
  }
  stats.removed = remove.size - stats.merged;
  stats.eventsOut = stats.eventsIn - stats.removed;
  if (stats.merged === 0) return { text: input, stats };
  // Lines that stay keep their index; a merged line sits at its place (a fraction between two indexes). Ties keep the order they were found in.
  const entries: Array<{ at: number; text: string }> = [];
  lines.forEach((l, i) => { if (!remove.has(i)) entries.push({ at: i, text: l }); });
  for (const [id, text] of replace) entries.push({ at: place.get(id)!, text });
  entries.sort((x, y) => x.at - y.at);
  const out = entries.map((e) => e.text);
  opt.onProgress?.(1);
  return { text: out.join(crlf ? '\r\n' : '\n'), stats };
};
