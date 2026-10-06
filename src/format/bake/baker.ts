import { resolvePlayRes } from '../../parser/ScriptInfo';
import { utf8 } from '../bytes';
import { modelFields, type ChunkEvent, type ModelEvent } from '../chunk';
import { fail } from '../errors';
import { Sha256 } from '../sha256';
import { ENCODER_ID } from '../version';
import { LineSplitter } from '../lines';
import { LineScanner } from '../scan';
import { XparWriter, type EncodeOptions, type Sink } from '../writer';

import { bakeText } from './textBake';
import { defaultParams, frameAtOrAfter, frameTime, gridCs, quanta, type BakeParams, type Quanta } from './params';

const DEC = new TextDecoder('utf-8');
const ORDER = ['script info', 'v4+ styles', 'v4 styles', 'v4 styles+', 'events'];

export interface BakeStats {
  eventsIn: number;
  eventsOut: number;
  dropped: number;
  merged: number;
  collapsed: number;
}

/**
 * Lossy PAR baker: ASS bytes in, a PAR container out. One-way: quantizes to the frame grid, drops what no frame
 * shows, merges identical neighbours, rounds numbers below the visibility tolerance and strips what PAR ignores.
 */
export class Baker {
  readonly params: BakeParams;
  readonly stats: BakeStats = { eventsIn: 0, eventsOut: 0, dropped: 0, merged: 0, collapsed: 0 };
  private readonly sc = new LineScanner();
  private readonly sp = new LineSplitter();
  private readonly writer: XparWriter;
  private readonly kept = new Map<string, string[]>();
  private readonly info: Record<string, string> = {};
  private readonly styleScale = new Map<string, number>();
  private styleFields: string[] = [];
  private q: Quanta | null = null;
  private readonly pending = new Map<string, ChunkEvent>();
  private maxStart = 0;
  private bomDone = false;
  private readonly sha = new Sha256();
  private bytesIn = 0;
  private srcDurationMs = 0;

  constructor(sink: Sink, params: Partial<BakeParams> & { fps: number }, private readonly opts: EncodeOptions = {}) {
    if (!(params.fps >= 1 && params.fps <= 90)) fail('INVALID_INPUT', 'fps must be between 1 and 90');
    this.params = defaultParams(params.fps, params);
    this.writer = new XparWriter(sink, opts, true);
  }

  private keep(section: string, text: string): void {
    if (!ORDER.includes(section) || text.trim() === '' || text.trim()[0] === ';') return;
    const a = this.kept.get(section) ?? [];
    a.push(text);
    this.kept.set(section, a);
    const kv = /^([^:]+):\s*(.*)$/.exec(text);
    if (!kv) return;
    if (section === 'script info') this.info[kv[1].trim().toLowerCase()] = kv[2].trim();
    else if (kv[1].trim().toLowerCase() === 'format') this.styleFields = kv[2].split(',').map((x) => x.trim().toLowerCase());
    else if (kv[1].trim().toLowerCase() === 'style') {
      const v = kv[2].split(',');
      const g = (k: string): number => Number(v[this.styleFields.indexOf(k)]) || 100;
      this.styleScale.set(v[this.styleFields.indexOf('name')]?.trim().replace(/^\*+/, '') ?? '', Math.max(g('scalex'), g('scaley')) / 100);
    }
  }

  private quanta(): Quanta {
    if (!this.q) {
      const pr = resolvePlayRes(Number(this.info.playresx) || 0, Number(this.info.playresy) || 0);
      this.q = quanta(this.params, pr.x, pr.y);
    }
    return this.q;
  }

  private flushPending(all: boolean): void {
    const limit = this.maxStart - 200;
    for (const [k, e] of this.pending) {
      if (all || e.m!.endCs < limit) {
        this.writer.addEvent(e, 120 + e.m!.text.length);
        this.stats.eventsOut++;
        this.pending.delete(k);
      }
    }
  }

  private line = (bytes: Uint8Array): void => {
    const text = DEC.decode(bytes);
    const c = this.sc.scan(text);
    if (c.t === 'misc') return this.keep(this.sc.section, text);
    if (c.comment) return;
    this.stats.eventsIn++;
    this.srcDurationMs = Math.max(this.srcDurationMs, c.endMs);
    const f = c.fmt >= 0 ? this.sc.formats[c.fmt] : null;
    const m = f?.standard ? modelFields(text, false) : null;
    if (!m) fail('UNSUPPORTED', 'PAR bake needs the standard V4+ event format with canonical fields; use XPAR for this file');
    this.event(m!, c.ordinal);
  };

  private event(m: ModelEvent, ordinal: number): void {
    const p = this.params;
    const s = m.startCs / 100;
    const e = m.endCs / 100;
    const k0 = frameAtOrAfter(s, p);
    const k1 = frameAtOrAfter(e, p);
    if (k1 - k0 <= 0) {
      this.stats.dropped++;
      return;
    }
    const scales = [...m.text.matchAll(/\\fsc[xy]([\d.]+)/g)].map((x) => Number(x[1]) / 100);
    const maxScale = Math.max(1, this.styleScale.get(m.style.replace(/^\*+/, '')) ?? 1, ...scales);
    const single = k1 - k0 === 1 ? { rel: (frameTime(k0, p) - s) * 1000, dur: (e - s) * 1000 } : null;
    const r = bakeText(m.text, { q: this.quanta(), maxScale, single });
    if (single && /\\(?:t|move|fad)/.test(m.text) && !r.animated) this.stats.collapsed++;
    let startCs = m.startCs;
    let endCs = m.endCs;
    if (!r.animated) {
      startCs = gridCs(k0, p);
      endCs = gridCs(k1, p);
    }
    const out: ModelEvent = { layer: m.layer, startCs, endCs, style: m.style, name: '', ml: m.ml, mr: m.mr, mv: m.mv, effect: '', text: r.text };
    const ev: ChunkEvent = { lineNo: ordinal, comment: false, ordinal, startMs: startCs * 10, endMs: endCs * 10, fmt: -1, raw: null, m: out };
    this.maxStart = Math.max(this.maxStart, startCs);
    if (p.merge && !r.animated && r.positioned) {
      const key = `${out.layer}|${out.style}|${out.ml},${out.mr},${out.mv}|${out.text}`;
      const prev = this.pending.get(key);
      if (prev && prev.m!.endCs === startCs) {
        prev.m!.endCs = endCs;
        prev.endMs = endCs * 10;
        this.stats.merged++;
        return;
      }
      if (prev) this.flushKey(key);
      this.pending.set(key, ev);
    } else {
      this.writer.addEvent(ev, 120 + out.text.length);
      this.stats.eventsOut++;
    }
    if (this.pending.size > 20000 || this.stats.eventsIn % 4096 === 0) this.flushPending(false);
  }

  private flushKey(key: string): void {
    const e = this.pending.get(key)!;
    this.writer.addEvent(e, 120 + e.m!.text.length);
    this.stats.eventsOut++;
    this.pending.delete(key);
  }

  async push(chunk: Uint8Array): Promise<void> {
    if (this.opts.signal?.aborted) fail('ABORTED', 'bake cancelled');
    this.sha.update(chunk);
    this.bytesIn += chunk.length;
    await this.pushRaw(chunk);
    this.opts.onProgress?.({ bytesIn: this.bytesIn, bytesOut: this.writer.bytesOut, events: this.writer.eventCount, fraction: this.opts.totalBytes ? Math.min(1, this.bytesIn / this.opts.totalBytes) : null });
  }

  private async pushRaw(chunk: Uint8Array): Promise<void> {
    if (!this.bomDone && chunk.length >= 3 && chunk[0] === 0xef && chunk[1] === 0xbb && chunk[2] === 0xbf) chunk = chunk.subarray(3);
    if (chunk.length) this.bomDone = true;
    this.sp.push(chunk, this.line);
    await this.writer.flushDue();
  }

  async finish(): Promise<void> {
    this.sp.end(this.line);
    this.flushPending(true);
    const lines = ORDER.flatMap((s) => this.kept.get(s) ?? []);
    lines.forEach((t, i) => this.writer.misc.push({ lineNo: i - lines.length, bytes: utf8(t) }));
    await this.writer.finish({
      bom: false, crlf: false, finalNewline: true, lines: lines.length + this.stats.eventsOut, dialogues: this.stats.eventsOut,
      formats: this.sc.formats.map((f) => f.names.join(',')), eolExceptions: [],
      params: JSON.stringify({ kind: 'par', version: 1, ...this.params, stats: this.stats }),
      prov: { kind: 1, sha256: this.sha.digest(), srcBytes: this.bytesIn, srcDurationMs: this.srcDurationMs, fpsX1000: Math.round(this.params.fps * 1000), encoder: ENCODER_ID },
    });
  }
}
