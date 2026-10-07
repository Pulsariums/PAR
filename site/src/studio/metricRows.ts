import type { PARMetrics } from '../../../src/index';
import { humanBytes } from '../common/format';
import type { Dict } from '../i18n/en';

export type Render = PARMetrics['render'];
export interface MetricRow { key: keyof Dict; value: string }

const DASH = '—';
const pct = (a: number, b: number): string => (b > 0 ? `${Math.round((a / b) * 100)}%` : DASH);
const ms = (n: number): string => (Math.round(n * 10) / 10).toFixed(1);

/** The render-path numbers of `getMetrics().render` as label key + value (pure: the panel only prints them). */
export const renderRows = (r: Render): MetricRow[] => [
  { key: 'st.m.mode', value: r.canvasSupported ? r.mode : `${r.mode} (no canvas)` },
  { key: 'st.m.paths', value: `${r.domLines} / ${r.canvasLines} (${r.canvasRuns} canvas${r.runsMerged ? `, ${r.runsMerged} merged` : ''})` },
  { key: 'st.m.sprites', value: `${r.sprites} (${humanBytes(r.spriteBytes)})` },
  { key: 'st.m.cache', value: `${pct(r.spriteHits, r.spriteHits + r.spriteMisses)} hit, ${r.evictions} evicted, ${r.prewarmed} prewarmed` },
  { key: 'st.m.drawn', value: `${r.drawn} / ${r.fillMpx.toFixed(2)} Mpx` },
  { key: 'st.m.shed', value: r.shedBudgetMpx > 0 || r.shed > 0 ? `${r.shed} (limit ${r.shedBudgetMpx.toFixed(2)} Mpx)` : DASH },
  { key: 'st.m.dropped', value: `${r.detailDropped} / ${r.skipped}` },
  { key: 'st.m.frameMs', value: r.frameMs.samples > 0 ? `${ms(r.frameMs.p50)} / ${ms(r.frameMs.p95)} ms` : DASH },
];

/** From this many lines at once a scene counts as heavy (karaoke / OP-ED particle bursts). */
export const HEAVY_LINES = 150;
/** A heavy reading keeps the hint up this long, so it does not flicker between two frames. */
const HOLD_MS = 3000;

export type HeavyState = 'none' | 'dom' | 'auto';

/** The "Heavy scene" hint: on while many lines are on screen (and 3 s after), with the advice that fits the render mode. */
export class HeavyHint {
  private until = 0;
  private lines = 0;

  /** `now` in ms. Returns what to show: nothing, switch-the-mode advice (dom mode) or tuning advice (auto / canvas). */
  update(activeLines: number, mode: Render['mode'], now: number): HeavyState {
    if (activeLines >= HEAVY_LINES) { this.until = now + HOLD_MS; this.lines = Math.max(activeLines, this.lines); }
    if (now >= this.until) { this.lines = 0; return 'none'; }
    return mode === 'dom' ? 'dom' : 'auto';
  }

  /** The largest line count of the current heavy stretch (for the hint text). */
  get peak(): number { return this.lines; }
}
