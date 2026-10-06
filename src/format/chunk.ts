import { DictReader, DictWriter } from './dict';
import { fail, LIMITS } from './errors';
import { StreamReader, StreamWriter } from './streams';
import { TextDec } from './textDec';
import { TextEnc } from './textEnc';
import { K } from './textKeys';
import { fmtCs, parseCs } from './timefmt';
import { VecCoder } from './vec';

/** One Dialogue/Comment line in the standard V4+ column order, fields already validated as canonical. */
export interface ModelEvent {
  layer: number;
  startCs: number;
  endCs: number;
  style: string;
  name: string;
  ml: number;
  mr: number;
  mv: number;
  effect: string;
  text: string;
}

export interface ChunkEvent {
  /** Position in the file (or sort key in lossy files). */
  lineNo: number;
  comment: boolean;
  /** Dialogue ordinal (-1 for comments). */
  ordinal: number;
  startMs: number;
  endMs: number;
  /** Format id for verbatim events (-1 = script default), unused otherwise. */
  fmt: number;
  /** Set for events the columnar codec cannot model: the whole line, verbatim. */
  raw: string | null;
  m: ModelEvent | null;
}

export interface DecodedEvent {
  lineNo: number;
  comment: boolean;
  ordinal: number;
  fmt: number;
  /** Complete line text (without terminator). */
  line: string;
  /** Milliseconds for modeled events, NaN for verbatim ones (parse `line` with its format). */
  startMs: number;
  endMs: number;
  raw: boolean;
}

const INT_RE = /^-?(?:0|[1-9]\d{0,8})$/;

export const printEvent = (comment: boolean, e: ModelEvent): string =>
  `${comment ? 'Comment' : 'Dialogue'}: ${e.layer},${fmtCs(e.startCs)},${fmtCs(e.endCs)},${e.style},${e.name},${e.ml},${e.mr},${e.mv},${e.effect},${e.text}`;

/** Whole line of a standard V4+ event => fields; null when any spelling is non-canonical (the line is kept verbatim then). */
export const modelFields = (line: string, comment: boolean): ModelEvent | null => {
  const prefix = comment ? 'Comment: ' : 'Dialogue: ';
  if (!line.startsWith(prefix)) return null;
  const value = line.slice(prefix.length);
  const f: string[] = [];
  let p = 0;
  for (let i = 0; i < 9; i++) {
    const c = value.indexOf(',', p);
    if (c === -1) return null;
    f.push(value.slice(p, c));
    p = c + 1;
  }
  const s = parseCs(f[1]);
  const e = parseCs(f[2]);
  if (s === null || e === null) return null;
  for (const i of [0, 5, 6, 7]) if (!INT_RE.test(f[i])) return null;
  const ev: ModelEvent = { layer: +f[0], startCs: s, endCs: e, style: f[3], name: f[4], ml: +f[5], mr: +f[6], mv: +f[7], effect: f[8], text: value.slice(p) };
  return printEvent(comment, ev) === line ? ev : null;
};

/** Columnar chunk builder: every event column and every text slot goes to its own stream. */
export class ChunkBuilder {
  readonly sw = new StreamWriter();
  private readonly dict = new DictWriter();
  private readonly text = new TextEnc(this.sw, this.dict, new VecCoder());
  count = 0;
  minStartMs = Infinity;
  maxStartMs = -Infinity;
  maxEndMs = -Infinity;
  minLine = Infinity;
  maxLine = -Infinity;
  srcBytes = 0;
  private prevLine = -1;
  private prevOrd = -1;
  private prevStart = 0;

  add(ev: ChunkEvent, srcBytes: number): void {
    const sw = this.sw;
    this.count++;
    this.srcBytes += srcBytes;
    this.minStartMs = Math.min(this.minStartMs, ev.startMs);
    this.maxStartMs = Math.max(this.maxStartMs, ev.startMs);
    this.maxEndMs = Math.max(this.maxEndMs, ev.endMs);
    this.minLine = Math.min(this.minLine, ev.lineNo);
    this.maxLine = Math.max(this.maxLine, ev.lineNo);
    sw.w(K.KIND).u8((ev.comment ? 1 : 0) | (ev.raw !== null ? 2 : 0));
    sw.w(K.LINE).sv(ev.lineNo - this.prevLine - 1);
    this.prevLine = ev.lineNo;
    if (!ev.comment) {
      sw.w(K.ORD).sv(ev.ordinal - this.prevOrd - 1);
      this.prevOrd = ev.ordinal;
    }
    if (ev.raw !== null) {
      sw.w(K.FMT).uv(ev.fmt + 1);
      this.dict.put(sw, K.RAW, ev.raw);
      return;
    }
    const m = ev.m!;
    sw.w(K.LAYER).sv(m.layer);
    sw.w(K.START).sv(m.startCs - this.prevStart);
    this.prevStart = m.startCs;
    sw.w(K.DUR).sv(m.endCs - m.startCs);
    this.dict.put(sw, K.STYLE, m.style);
    this.dict.put(sw, K.NAME, m.name);
    this.dict.put(sw, K.EFFECT, m.effect);
    const mg = sw.w(K.MARGIN);
    mg.uv(m.ml);
    mg.uv(m.mr);
    mg.uv(m.mv);
    this.text.encode(m.text);
  }

  /** Raw (pre-entropy) block bytes. */
  finish(): Uint8Array {
    return this.sw.serialize();
  }
}

export const decodeChunk = (raw: Uint8Array, count: number): DecodedEvent[] => {
  if (count > LIMITS.maxEvents) fail('LIMIT', 'too many events in a chunk');
  const sr = new StreamReader(raw);
  const dict = new DictReader();
  const text = new TextDec(sr, dict, new VecCoder());
  const out: DecodedEvent[] = [];
  const kind = sr.r(K.KIND);
  const line = sr.r(K.LINE);
  let prevLine = -1;
  let prevOrd = -1;
  let prevStart = 0;
  for (let i = 0; i < count; i++) {
    const kd = kind.u8();
    const comment = (kd & 1) !== 0;
    const lineNo = prevLine + 1 + line.sv();
    prevLine = lineNo;
    let ordinal = -1;
    if (!comment) {
      ordinal = prevOrd + 1 + sr.r(K.ORD).sv();
      prevOrd = ordinal;
    }
    if (kd & 2) {
      const fmt = sr.r(K.FMT).uv() - 1;
      out.push({ lineNo, comment, ordinal, fmt, line: dict.get(sr, K.RAW), startMs: NaN, endMs: NaN, raw: true });
      continue;
    }
    const layer = sr.r(K.LAYER).sv();
    const startCs = prevStart + sr.r(K.START).sv();
    prevStart = startCs;
    const endCs = startCs + sr.r(K.DUR).sv();
    const style = dict.get(sr, K.STYLE);
    const name = dict.get(sr, K.NAME);
    const effect = dict.get(sr, K.EFFECT);
    const mg = sr.r(K.MARGIN);
    const ml = mg.uv();
    const mr = mg.uv();
    const mv = mg.uv();
    const t = text.decode();
    const m: ModelEvent = { layer, startCs, endCs, style, name, ml, mr, mv, effect, text: t };
    out.push({ lineNo, comment, ordinal, fmt: -1, line: printEvent(comment, m), startMs: startCs * 10, endMs: endCs * 10, raw: false });
  }
  return out;
};

