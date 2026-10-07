import { toOptEvent, type OptEvent } from '../optimize/events';
import { findChains } from '../optimize/find';
import type { AssStyle } from '../types/script';

import type { ChainSummary } from './types';

/** Collects the Dialogue lines that look like one frame of frame-by-frame typesetting, then finds the runs the optimizer would merge. */
export class Runs {
  private readonly events: OptEvent[] = [];
  private n = 0;

  add(line: string): void {
    const e = toOptEvent(line, this.n++);
    if (e) this.events.push(e);
  }

  summary(styles: Map<string, AssStyle>): ChainSummary {
    const chains = findChains(this.events, styles);
    let events = 0;
    for (const c of chains) events += c.length;
    return { chains: chains.length, events, saveable: events - chains.length };
  }
}
