import type { Complexity } from '../canvas/eligibility';

/** Counts which events the canvas path takes and why it leaves the others to the DOM (`Complexity.reason`). */
export class Eligibility {
  events = 0;
  eligible = 0;
  lineMs = 0;
  eligibleMs = 0;
  readonly reasons: Record<string, number> = {};

  add(c: Complexity, durMs: number): void {
    this.events++;
    this.lineMs += durMs;
    if (c.eligible) { this.eligible++; this.eligibleMs += durMs; } else this.reasons[c.reason] = (this.reasons[c.reason] ?? 0) + 1;
  }
}
