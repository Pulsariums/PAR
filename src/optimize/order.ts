import { Grid, TimedGrid } from './grid';

/** Drawing order: events of one layer are drawn in file order, so a merged event (written where its first frame was) must keep its place relative to everything it overlaps. */

/** Where an event draws: centre (`\pos`) and a radius that holds every pixel it can draw. Unknown (absent) = may overlap anything. */
export interface Spot { x: number; y: number; r: number }

export interface Member { s: number; e: number; line: number; spot?: Spot }

/** Two events whose circles do not meet cannot cover the same pixel: their drawing order does not matter. */
const apart = (a?: Spot, b?: Spot): boolean => !!a && !!b && Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r;

/** A merged event to be: its frames (original lines, in time order) and where the merged line will sit. */
export interface Candidate {
  id: number;
  layer: number;
  first: number;
  members: Member[];
  /** Spread of its lines in the file: the wider one is given up first when two candidates disagree. */
  span: number;
}

/** Any Dialogue line of the file. `owner` is the candidate it is a frame of (-1: none). */
export interface Plain { layer: number; s: number; e: number; line: number; owner: number; spot?: Spot }

/** On the moments they show together (and could cover the same pixels), is `c` drawn before `p`, after it, or both at different times? */
interface Sides { before: boolean; after: boolean }

const againstLine = (c: Candidate, p: Plain, steps: { n: number }): Sides => {
  const r: Sides = { before: false, after: false };
  for (const m of c.members) {
    steps.n++;
    if (m.s >= p.e) break;
    if (m.e <= p.s || apart(m.spot, p.spot)) continue;
    if (m.line < p.line) r.before = true; else r.after = true;
  }
  return r;
};

/** Same for two candidates: at every moment both show a frame, the original order of those frames. */
const against = (a: Candidate, b: Candidate, steps: { n: number }): Sides => {
  const r: Sides = { before: false, after: false };
  let i = 0, j = 0;
  while (i < a.members.length && j < b.members.length) {
    steps.n++;
    const x = a.members[i], y = b.members[j];
    if (Math.min(x.e, y.e) > Math.max(x.s, y.s) && !apart(x.spot, y.spot)) { if (x.line < y.line) r.before = true; else r.after = true; }
    if (x.e <= y.e) i++; else j++;
  }
  return r;
};

/** Work allowed for the check (comparisons); candidates left unchecked when it runs out are given up (their lines stay). */
const BUDGET = 2e9;
/** Spacing of merged lines that share a gap between two file lines (a chain of this many neighbours still fits inside one gap). */
const EPS = 1e-6;

type Item = { kind: 'p'; p: Plain } | { kind: 'c'; c: Candidate; s: number; e: number };

interface Analysis {
  /** Per candidate: it must sit after the line `lo` and before the line `hi` (file line indexes of lines that stay). */
  lo: Map<number, number>;
  hi: Map<number, number>;
  /** `[a, b]`: merged event a must be drawn before merged event b. */
  edges: Array<[number, number]>;
  /** Candidates whose original order against something changes over time: no single place keeps it. */
  bad: Set<number>;
}

/** One sweep over time collecting what every live candidate must respect. */
const analyse = (items: readonly Item[], drop: ReadonlySet<number>, steps: { n: number }, reach: number): Analysis => {
  const out: Analysis = { lo: new Map(), hi: new Map(), edges: [], bad: new Set() };
  type Layer = { plain: Grid<Plain>; cands: Grid<Candidate> };
  const byLayer = new Map<number, Layer>();
  const layerOf = (l: number): Layer => byLayer.get(l) ?? byLayer.set(l, { plain: new Grid(), cands: new Grid() }).get(l)!;
  const live = (id: number): boolean => !drop.has(id) && !out.bad.has(id);
  const bound = (c: Candidate, y: Plain, r: Sides): void => {
    if (r.before && r.after) { out.bad.add(c.id); return; }
    if (r.before) out.hi.set(c.id, Math.min(out.hi.get(c.id) ?? Infinity, y.line));
    if (r.after) out.lo.set(c.id, Math.max(out.lo.get(c.id) ?? -Infinity, y.line));
  };
  for (const it of items) {
    if (steps.n > BUDGET) { items.forEach((x) => { if (x.kind === 'c') out.bad.add(x.c.id); }); return out; }
    // A frame of a live candidate is not a line of its own: the merged line stands for it.
    if (it.kind === 'p' && it.p.owner >= 0 && !drop.has(it.p.owner)) continue;
    const act = layerOf(it.kind === 'p' ? it.p.layer : it.c.layer);
    if (it.kind === 'p') {
      act.cands.near([it.p.spot], reach, it.p.s, (c) => { if (live(c.id)) bound(c, it.p, againstLine(c, it.p, steps)); });
      act.plain.add(it.p, it.p.e, [it.p.spot]);
    } else {
      const spots = it.c.members.map((m) => m.spot);
      act.plain.near(spots, reach, it.s, (p) => { if (live(it.c.id)) bound(it.c, p, againstLine(it.c, p, steps)); });
      act.cands.near(spots, reach, it.s, (c) => {
        if (c.id === it.c.id || !live(c.id) || !live(it.c.id)) return;
        const r = against(c, it.c, steps);
        // Drawn first, then last, against each other over time: no single place for either keeps that, and giving up only one leaves its
        // frames as lines the other cannot be placed against either (they flip the same way), so both go.
        if (r.before && r.after) { out.bad.add(c.id); out.bad.add(it.c.id); }
        else if (r.before) out.edges.push([c.id, it.c.id]);
        else if (r.after) out.edges.push([it.c.id, c.id]);
      });
      act.cands.add(it.c, it.e, spots);
    }
  }
  return out;
};

/** Members of every cycle of a directed graph: its strongly connected components with more than one node (Tarjan, without recursion). */
const cycles = (nodes: readonly number[], succ: ReadonlyMap<number, readonly number[]>): number[][] => {
  const index = new Map<number, number>(), low = new Map<number, number>(), onStack = new Set<number>();
  const stack: number[] = [], out: number[][] = [];
  let next = 0;
  for (const root of nodes) {
    if (index.has(root)) continue;
    const work: Array<{ v: number; i: number }> = [{ v: root, i: 0 }];
    index.set(root, next); low.set(root, next++); stack.push(root); onStack.add(root);
    while (work.length) {
      const f = work[work.length - 1];
      const ws = succ.get(f.v) ?? [];
      if (f.i < ws.length) {
        const w = ws[f.i++];
        if (!succ.has(w)) continue;
        if (!index.has(w)) {
          index.set(w, next); low.set(w, next++); stack.push(w); onStack.add(w);
          work.push({ v: w, i: 0 });
        } else if (onStack.has(w)) low.set(f.v, Math.min(low.get(f.v)!, index.get(w)!));
      } else {
        work.pop();
        if (work.length) { const p = work[work.length - 1].v; low.set(p, Math.min(low.get(p)!, low.get(f.v)!)); }
        if (low.get(f.v) === index.get(f.v)) {
          const comp: number[] = [];
          let w: number;
          do { w = stack.pop()!; onStack.delete(w); comp.push(w); } while (w !== f.v);
          if (comp.length > 1) out.push(comp);
        }
      }
    }
  }
  return out;
};

export interface Placement {
  /** Candidates that stay as original lines. */
  drop: Set<number>;
  /** Where each kept candidate's merged line goes: a position in file-line units (between two lines when fractional). */
  at: Map<number, number>;
}

/**
 * Where to write each merged event so that, against everything it overlaps, it is drawn in the same order as before: after the lines it was
 * above, before the ones it was below, and in the right order against other merged events. A candidate whose order against something
 * flips over time (no single place keeps it), or whose constraints cannot all hold, is dropped. Dropping turns its frames back into lines
 * that stay where they are, so each neighbour is checked against them (only the neighbours: the first sweep is not repeated), which can drop
 * more; this goes on until nothing changes.
 */
export const placeCandidates = (cands: readonly Candidate[], plain: readonly Plain[]): Placement => {
  const drop = new Set<number>();
  const steps = { n: 0 };
  let reach = 0;
  for (const p of plain) if (p.spot && p.spot.r > reach) reach = p.spot.r;
  for (const c of cands) for (const m of c.members) if (m.spot && m.spot.r > reach) reach = m.spot.r;
  const items: Item[] = [
    ...plain.map((p): Item => ({ kind: 'p', p })),
    ...cands.map((c): Item => ({ kind: 'c', c, s: c.members[0].s, e: Math.max(...c.members.map((m) => m.e)) })),
  ];
  const start = (it: Item): number => (it.kind === 'p' ? it.p.s : it.s);
  items.sort((x, y) => start(x) - start(y) || (x.kind === 'c' ? -1 : 1));
  const a = analyse(items, drop, steps, reach);
  if (steps.n > BUDGET) return { drop: new Set(cands.map((c) => c.id)), at: new Map() };

  // Candidates by place, to find the neighbours of a candidate that is given up.
  const byId = new Map(cands.map((c) => [c.id, c]));
  const near = new Map<number, TimedGrid<Candidate>>();
  for (const c of cands) (near.get(c.layer) ?? near.set(c.layer, new TimedGrid()).get(c.layer)!).add(c, c.members[0].s, Math.max(...c.members.map((m) => m.e)), c.members.map((m) => m.spot));
  const bound = (c: Candidate, y: Plain, r: Sides): void => {
    if (r.before && r.after) { a.bad.add(c.id); return; }
    if (r.before) a.hi.set(c.id, Math.min(a.hi.get(c.id) ?? Infinity, y.line));
    if (r.after) a.lo.set(c.id, Math.max(a.lo.get(c.id) ?? -Infinity, y.line));
  };
  const giveUp = (first: Iterable<number>): void => {
    const queue = [...first];
    while (queue.length) {
      const id = queue.pop()!;
      if (drop.has(id)) continue;
      drop.add(id);
      const z = byId.get(id)!;
      for (const m of z.members) {
        const p: Plain = { layer: z.layer, s: m.s, e: m.e, line: m.line, owner: -1, spot: m.spot };
        near.get(z.layer)?.near(m.spot, reach, m.s, m.e, (x) => {
          if (x.id === id || drop.has(x.id)) return;
          bound(x, p, againstLine(x, p, steps));
          if (a.bad.has(x.id)) queue.push(x.id);
        });
      }
    }
  };
  giveUp(a.bad);
  a.bad.clear();

  for (let pass = 0; pass < 1000; pass++) {
    const alive = cands.filter((c) => !drop.has(c.id));
    // Places: after `lo` (just above it), pushed past every merged event that must come first (topological order); checked against `hi`.
    const place = new Map<number, number>();
    const succ = new Map<number, number[]>();
    for (const c of alive) succ.set(c.id, []);
    for (const [x, y] of a.edges) if (succ.has(x) && succ.has(y)) succ.get(x)!.push(y);
    const failed = new Set<number>();
    // Several orders that cannot hold together at once (A before B, B before C, C before A, each at a different time) leave no place at all.
    for (const comp of cycles(alive.map((c) => c.id), succ)) comp.forEach((id) => failed.add(id));
    const kept = alive.filter((c) => !failed.has(c.id));
    const indeg = new Map<number, number>(kept.map((c) => [c.id, 0]));
    for (const c of kept) for (const y of succ.get(c.id)!) if (indeg.has(y)) indeg.set(y, indeg.get(y)! + 1);
    for (const c of kept) {
      const lo = a.lo.get(c.id) ?? -Infinity, hi = a.hi.get(c.id) ?? Infinity;
      place.set(c.id, Number.isFinite(lo) ? lo + 0.5 : Math.min(c.first, hi) - 0.5);
    }
    const queue = kept.filter((c) => indeg.get(c.id) === 0).map((c) => c.id);
    while (queue.length) {
      const x = queue.pop()!;
      for (const y of succ.get(x)!) {
        if (!indeg.has(y)) continue;
        place.set(y, Math.max(place.get(y)!, place.get(x)! + EPS));
        indeg.set(y, indeg.get(y)! - 1);
        if (indeg.get(y) === 0) queue.push(y);
      }
    }
    for (const c of kept) if (!(place.get(c.id)! < (a.hi.get(c.id) ?? Infinity))) failed.add(c.id);
    if (failed.size === 0) return { drop, at: place };
    giveUp(failed);
    a.bad.clear();
  }
  return { drop: new Set(cands.map((c) => c.id)), at: new Map() };
};
