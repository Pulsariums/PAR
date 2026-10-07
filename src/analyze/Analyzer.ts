import { prepareLine } from '../anim/Prepared';
import { analyzeLine } from '../canvas/eligibility';
import { spriteRequests } from '../canvas/sprites';
import { msOf } from '../core/time';
import type { LineEnv } from '../render/LineView';
import type { AssEvent, AssStyle, ScriptInfo } from '../types/script';

import { Series } from './bins';
import { findBursts } from './bursts';
import { analysisEnv } from './env';
import { KeyRegistry } from './keys';
import { Eligibility } from './reasons';
import { Usage } from './styles';
import type { AnalyzeOptions, AnalyzeReport, ChainSummary, SecondRow } from './types';

const r1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * Order-independent accumulator over events (a script is in file order, not time order): per-frame visible lines (difference series),
 * the sprite keys the canvas path would build (the same `spriteRequests` it uses), eligibility reasons and style / font use.
 * Memory is series indexed by frame / second plus one record per distinct sprite key; no event is kept.
 */
export class Analyzer {
  private readonly env: LineEnv;
  private readonly scale: number;
  private readonly layout: [number, number];
  private readonly fps: number;
  private readonly diff = new Series();
  private readonly diffCanvas = new Series();
  private readonly starts = new Series();
  private readonly keys: KeyRegistry;
  private readonly why = new Eligibility();
  private readonly usage = new Usage();
  private endMs = 0;
  events = 0;

  constructor(private readonly info: ScriptInfo, private readonly styles: Map<string, AssStyle>, private readonly o: AnalyzeOptions) {
    this.fps = o.fps && o.fps > 0 ? o.fps : 24;
    const e = analysisEnv(info, styles, o.width, this.fps);
    [this.env, this.scale, this.layout] = [e.env, e.scale, e.layout];
    this.keys = new KeyRegistry(o.maxKeys ?? 400_000);
  }

  add(ev: AssEvent): void {
    this.events++;
    const s = msOf(ev.start), e = msOf(ev.end);
    if (e > this.endMs) this.endMs = e;
    this.starts.add(Math.max(0, Math.floor(s / 1000)), 1);
    const line = prepareLine(ev, this.styles, this.info);
    this.usage.add(ev, line.style);
    const c = analyzeLine(line);
    this.why.add(c, Math.max(0, e - s));
    if (e <= s) return;
    const k0 = Math.max(0, Math.ceil((s * this.fps) / 1000)), k1 = Math.max(0, Math.ceil((e * this.fps) / 1000));
    if (k1 <= k0) return;
    this.diff.add(k0, 1); this.diff.add(k1, -1);
    if (!c.eligible) return;
    this.diffCanvas.add(k0, 1); this.diffCanvas.add(k1, -1);
    for (const r of spriteRequests(line, this.env, c.animated, 1000 / this.fps, s)) this.keys.add(r);
  }

  report(bytes: number | null, chains: ChainSummary | null): AnalyzeReport {
    const fps = this.fps;
    const vis = this.diff.running();
    const first = this.keys.firstUses(fps);
    const bursts = findBursts(vis, this.o.burstMin ?? 40, fps, first.frameKeys, first.frameCost);
    const seconds = Math.max(this.starts.length, this.keys.requestsBySecond.length, Math.ceil((vis.length * 1) / fps));
    const rows: SecondRow[] = [];
    for (let s = 0; s < seconds; s++) {
      const peak = vis.max(Math.floor(s * fps), Math.ceil((s + 1) * fps)).v;
      const row = { s, starts: this.starts.get(s), visible: peak, requests: this.keys.requestsBySecond.get(s), keys: this.keys.distinctIn(s), newKeys: first.secKeys.get(s), buildMs: r1(first.secCost.get(s)) };
      if (row.starts || row.visible || row.requests) rows.push(row);
    }
    const pk = vis.max();
    const tot = this.keys.totals();
    const w = this.why;
    return {
      schema: 'par-analyze/1',
      input: { events: this.events, durationS: Math.round(this.endMs / 100) / 10, layout: this.layout, fps, scale: this.scale, bytes },
      peak: { visible: pk.v, at: Math.round((pk.at / fps) * 100) / 100 },
      seconds: rows,
      bursts,
      sprites: { distinct: this.keys.distinct, masks: this.keys.maskCount, requests: this.keys.requests, keysCapped: this.keys.capped, buildMs: r1(tot.buildMs), megabytes: r1(tot.bytes / 1048576), msPerSprite: this.keys.distinct ? Math.round((tot.buildMs / this.keys.distinct) * 1000) / 1000 : 0 },
      keys: this.keys.list(this.o.listKeys ?? 2000),
      canvas: { events: w.eligible, share: w.events ? w.eligible / w.events : 0, lineSeconds: r1(w.eligibleMs / 1000), lineSecondsShare: w.lineMs ? w.eligibleMs / w.lineMs : 0, reasons: w.reasons },
      chains,
      styles: this.usage.summary(this.styles),
    };
  }
}
