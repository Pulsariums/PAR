import { findStyle } from '../parser/StyleParser';
import type { AssStyle } from '../types/script';

import { buildChains, type Chain, type TolFor } from './chains';
import type { OptEvent } from './events';
import { fitAllowed, geometryOf, type Geo } from './tolerance';
import type { OptimizeMode } from './types';

/** Tolerance functions of a script's events at one mode: what the chain finder and the fit both measure against. */
export const tolerances = (styles: Map<string, AssStyle>, mode: OptimizeMode) => {
  const styleOf = (e: OptEvent): AssStyle => findStyle(styles, e.m.style);
  const tolWith = (kinds: OptEvent['kinds'], geo: Geo) => (slot: number, v: number): number => fitAllowed(kinds[slot], v, geo, mode);
  const tolFor: TolFor = (kinds, sample) => tolWith(kinds, geometryOf([sample], styleOf(sample)));
  return { styleOf, tolWith, tolFor };
};

/** The runs of frame-by-frame events the optimizer would try to merge (before its check against PAR's own evaluation). */
export const findChains = (events: readonly OptEvent[], styles: Map<string, AssStyle>, mode: OptimizeMode = 'invisible', minChain = 3): Chain[] =>
  buildChains(events, tolerances(styles, mode).tolFor, Math.max(2, minChain));
