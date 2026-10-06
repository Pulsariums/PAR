import { msOf } from '../core/time';
import type { AssEvent } from '../types/script';

/**
 * Window membership on integer milliseconds: the event [start, end) and the window [t0, t1) overlap, and the event has a
 * duration. Adjacent windows therefore never both contain (or both miss) an event that starts or ends exactly on their border.
 */
export const inWindow = (ev: AssEvent, t0: number, t1: number): boolean => {
  const s = msOf(ev.start);
  const e = msOf(ev.end);
  return e > s && s < msOf(t1) && e > msOf(t0);
};

export const filterWindow = (events: readonly AssEvent[], t0: number, t1: number): AssEvent[] =>
  events.filter((ev) => inWindow(ev, t0, t1)).sort((a, b) => a.index - b.index);

/** Shared base: wraps a time and a counter pair so adapters report the same stats shape. */
export class Meter {
  bytesRead = 0;
  decodeMs = 0;
  time<T>(fn: () => Promise<T>): Promise<T> {
    const t = performance.now();
    return fn().finally(() => { this.decodeMs += performance.now() - t; });
  }
}
