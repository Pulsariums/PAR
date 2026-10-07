import type { OptEvent } from './events';

/** Consecutive events (each starts where the last ended) of one shape: the frames of one thing moving. */
export type Chain = OptEvent[];

/** Tolerance of slot `slot` for events of this kind list (see `tolerance.ts`). */
export type TolFor = (kinds: OptEvent['kinds'], sample: OptEvent) => (slot: number, v: number) => number;

const distance = (a: OptEvent, b: OptEvent, tol: (slot: number, v: number) => number): number => {
  let d = 0;
  for (let s = 0; s < a.vals.length; s++) d += Math.abs(a.vals[s] - b.vals[s]) / Math.max(tol(s, a.vals[s]), 1e-9);
  return d;
};

/**
 * Finds the chains: among events of one shape, an event continues the chain that ended exactly where it starts and is nearest in
 * value (several particles of one shape move at once, they keep their order from frame to frame). Matching is greedy; a wrong
 * match only produces a run that does not fit a line, which the fit then cuts (and the check against PAR would reject).
 */
export const buildChains = (events: readonly OptEvent[], tolFor: TolFor, minChain: number): Chain[] => {
  const groups = new Map<string, OptEvent[]>();
  for (const e of events) (groups.get(e.key) ?? groups.set(e.key, []).get(e.key)!).push(e);
  const all: Chain[] = [];
  for (const g of groups.values()) {
    if (g.length < minChain) continue;
    g.sort((x, y) => x.m.startCs - y.m.startCs || x.line - y.line);
    const tol = tolFor(g[0].kinds, g[0]);
    const open = new Map<number, Chain[]>();
    const chains: Chain[] = [];
    for (const e of g) {
      const cands = open.get(e.m.startCs);
      let pick = -1;
      if (cands && cands.length) {
        let best = Infinity;
        cands.forEach((c, i) => { const d = distance(c[c.length - 1], e, tol); if (d < best) { best = d; pick = i; } });
      }
      let chain: Chain;
      if (pick >= 0) { chain = cands!.splice(pick, 1)[0]; chain.push(e); } else { chain = [e]; chains.push(chain); }
      (open.get(e.m.endCs) ?? open.set(e.m.endCs, []).get(e.m.endCs)!).push(chain);
    }
    for (const c of chains) if (c.length >= minChain) all.push(c);
  }
  return all;
};
