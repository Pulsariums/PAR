import { estimateBuildMs, estimateBytes, estimateTintMs } from '../canvas/cost';
import { maskOf } from '../canvas/tint';
import type { SpriteReq } from '../canvas/sprites';

import { Series } from './bins';
import type { KeyUse } from './types';

interface Info { id: number; ms: number; uses: number; cost: number; bytes: number; mask: string | null }

/** Pairs (second, key) remembered for "distinct keys per second"; past it the per-second distinct count stops growing. */
const MAX_PAIRS = 3_000_000;

/**
 * Every sprite key an analysis meets: first use, number of uses and estimated build cost. Single-colour sprites are tinted from a shared
 * white mask in the canvas path, so the glyph build (the expensive part) is charged to the first key that needs its mask, the tint to each key.
 */
export class KeyRegistry {
  private readonly keys = new Map<string, Info>();
  private readonly masks = new Map<string, { ms: number; cost: number }>();
  private readonly perSecond = new Map<number, Set<number>>();
  private pairs = 0;
  requests = 0;
  capped = false;
  readonly requestsBySecond = new Series();

  constructor(private readonly maxKeys: number) {}

  get distinct(): number { return this.keys.size; }
  get maskCount(): number { return this.masks.size; }

  add(r: SpriteReq): void {
    this.requests++;
    const sec = Math.max(0, Math.floor(r.ms / 1000));
    this.requestsBySecond.add(sec, 1);
    let k = this.keys.get(r.key);
    if (!k) {
      if (this.keys.size >= this.maxKeys) { this.capped = true; return; }
      const m = maskOf(r.spec);
      const build = estimateBuildMs(m ? m.spec : r.spec);
      k = { id: this.keys.size, ms: r.ms, uses: 0, cost: m ? estimateTintMs(r.spec) : build, bytes: estimateBytes(r.spec), mask: m ? m.key : null };
      this.keys.set(r.key, k);
      if (m) {
        const prev = this.masks.get(m.key);
        if (!prev) this.masks.set(m.key, { ms: r.ms, cost: build });
        else if (r.ms < prev.ms) prev.ms = r.ms;
      }
    }
    k.uses++;
    if (r.ms < k.ms) k.ms = r.ms;
    if (this.pairs < MAX_PAIRS) {
      let set = this.perSecond.get(sec);
      if (!set) this.perSecond.set(sec, (set = new Set()));
      if (!set.has(k.id)) { set.add(k.id); this.pairs++; }
    }
  }

  distinctIn(sec: number): number { return this.perSecond.get(sec)?.size ?? 0; }

  /** First uses as per-frame and per-second series (count and estimated ms) for the burst map. */
  firstUses(fps: number): { frameKeys: Series; frameCost: Series; secKeys: Series; secCost: Series } {
    const out = { frameKeys: new Series(), frameCost: new Series(), secKeys: new Series(), secCost: new Series() };
    const put = (ms: number, n: number, cost: number): void => {
      const f = Math.max(0, Math.floor((ms * fps) / 1000)), s = Math.max(0, Math.floor(ms / 1000));
      out.frameKeys.add(f, n); out.frameCost.add(f, cost); out.secKeys.add(s, n); out.secCost.add(s, cost);
    };
    for (const k of this.keys.values()) put(k.ms, 1, k.cost);
    for (const m of this.masks.values()) put(m.ms, 0, m.cost);
    return out;
  }

  totals(): { buildMs: number; bytes: number } {
    let buildMs = 0, bytes = 0;
    for (const k of this.keys.values()) { buildMs += k.cost; bytes += k.bytes; }
    for (const m of this.masks.values()) buildMs += m.cost;
    return { buildMs, bytes };
  }

  /** Keys by first use, at most `limit` (the nearest first uses; a sort of all keys, not a spread). */
  list(limit: number): KeyUse[] {
    if (limit <= 0) return [];
    const all: Array<[string, Info]> = [];
    for (const e of this.keys) all.push(e);
    all.sort((a, b) => a[1].ms - b[1].ms);
    const out: KeyUse[] = [];
    for (let i = 0; i < Math.min(limit, all.length); i++) out.push({ key: all[i][0], at: Math.round(all[i][1].ms) / 1000, uses: all[i][1].uses, buildMs: Math.round(all[i][1].cost * 100) / 100 });
    return out;
  }
}
