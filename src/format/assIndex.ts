import { parseDialogue, V4_EVENT_FORMAT, V4P_EVENT_FORMAT } from '../parser/EventParser';
import { parseScript } from '../parser/ScriptParser';
import { splitKeyValue } from '../parser/sections';
import type { AssEvent, ParsedScript } from '../types/script';

import { fail } from './errors';
import type { AssIndexData, AssIndexOptions, AssRange } from './assTypes';
import { LineSplitter } from './lines';
import { LineScanner } from './scan';

const KEPT = new Set(['script info', 'v4+ styles', 'v4 styles', 'v4 styles+', 'events']);
const DEC = new TextDecoder('utf-8');

export type { AssIndexData, AssIndexOptions, AssRange } from './assTypes';

/** Plain-ASS time index. Holds offsets only; the text stays in the file and is fetched with Blob.slice (or HTTP Range). */
export class AssIndex {
  readonly script: ParsedScript;
  private readonly cache = new Map<number, string[]>();

  constructor(readonly data: AssIndexData, private readonly blob: Blob) {
    this.script = parseScript(data.header);
  }

  get duration(): number {
    return this.data.durationMs / 1000;
  }

  get ranges(): readonly AssRange[] {
    return this.data.ranges;
  }

  private fields(fmt: number): string[] {
    if (fmt >= 0) return this.data.formats[fmt].split(',');
    return /^v4\.00$/i.test(this.script.info.scriptType.trim()) ? V4_EVENT_FORMAT : V4P_EVENT_FORMAT;
  }

  private async lines(i: number): Promise<string[]> {
    let l = this.cache.get(i);
    if (!l) {
      const r = this.data.ranges[i];
      const text = DEC.decode(await this.blob.slice(r.off, r.off + r.len).arrayBuffer());
      l = text.split('\n').map((s) => (s.endsWith('\r') ? s.slice(0, -1) : s));
      if (l[l.length - 1] === '') l.pop();
      this.cache.set(i, l);
      if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value as number);
    }
    return l;
  }

  /** Raw text of run `i` (event lines only); lets callers sample the file without reading all of it. */
  async rangeText(i: number): Promise<string> {
    return (await this.lines(i)).join('\n') + '\n';
  }

  get header(): string {
    return this.data.header;
  }

  /** Raw Dialogue lines visible in [t0, t1) (file order) with their ordinals; no parsing of the text. */
  async readWindowLines(t0: number, t1: number): Promise<Array<{ ordinal: number; line: string }>> {
    const out: Array<{ ordinal: number; line: string }> = [];
    for (const ev of await this.window(t0, t1)) out.push({ ordinal: ev.ev.index, line: ev.line });
    return out;
  }

  /** Mini ASS document (header + the window's events). */
  async readWindowText(t0: number, t1: number): Promise<string> {
    return `${this.data.header}\n${(await this.readWindowLines(t0, t1)).map((l) => l.line).join('\n')}\n`;
  }

  /** Events visible in [t0, t1): same structures and ids as parsing the whole file. */
  async readWindow(t0: number, t1: number): Promise<AssEvent[]> {
    return (await this.window(t0, t1)).map((w) => w.ev);
  }

  private async window(t0: number, t1: number): Promise<Array<{ ev: AssEvent; line: string }>> {
    const out: Array<{ ev: AssEvent; line: string }> = [];
    const a = t0 * 1000 - 1;
    const b = t1 * 1000 + 1;
    for (let i = 0; i < this.data.ranges.length; i++) {
      const r = this.data.ranges[i];
      if (!(r.minStartMs < b && r.maxEndMs > a)) continue;
      const fields = this.fields(r.fmt);
      let ord = r.ord0;
      for (const line of await this.lines(i)) {
        const kv = splitKeyValue(line.replace(/^\s+/, ''));
        if (!kv || kv[0].toLowerCase() !== 'dialogue') continue;
        const ev = parseDialogue(fields, kv[1], ord++);
        if (typeof ev !== 'string' && ev.start < t1 && ev.end > t0) out.push({ ev, line });
      }
    }
    return out.sort((x, y) => x.ev.index - y.ev.index);
  }
}

/**
 * Streams the file ONCE (Blob.stream()), keeping only the index. Event lines are grouped into byte runs; run
 * metadata records the min start / max end, so unsorted files stay correct (they just touch more runs).
 */
export const indexAss = async (file: Blob, opts: AssIndexOptions = {}): Promise<AssIndex> => {
  const rangeBytes = opts.rangeBytes ?? 256 * 1024;
  const longMs = opts.longMs ?? 20_000;
  const maxHeader = opts.maxHeaderBytes ?? 8 * 1024 * 1024;
  const sc = new LineScanner();
  const sp = new LineSplitter();
  const data: AssIndexData = { ranges: [], header: '', formats: [], durationMs: 0, events: 0, bytes: file.size, fonts: null };
  const header: string[] = [];
  let headerBytes = 0;
  let keep = false;
  let fontsEnd = false;
  let done2 = 0;
  let off = 0;
  let cur: (AssRange & { long: boolean }) | null = null;
  const close = (): void => {
    if (cur) data.ranges.push({ off: cur.off, len: cur.len, minStartMs: cur.minStartMs, maxEndMs: cur.maxEndMs, ord0: cur.ord0, fmt: cur.fmt, count: cur.count });
    cur = null;
  };
  const onLine = (bytes: Uint8Array, eol: 0 | 1 | 2): void => {
    const size = bytes.length + eol;
    const text = DEC.decode(bytes);
    const before = sc.ordinal;
    const c = sc.scan(text);
    if (c.t === 'event') {
      data.events++;
      const long = c.endMs - c.startMs >= longMs;
      if (cur && (cur.fmt !== c.fmt || cur.long !== long || cur.len >= rangeBytes || (cur.off + cur.len !== off))) close();
      if (!cur) cur = { off, len: 0, minStartMs: Infinity, maxEndMs: -Infinity, ord0: c.comment ? before : c.ordinal, fmt: c.fmt, count: 0, long };
      cur.len += size;
      cur.count++;
      cur.minStartMs = Math.min(cur.minStartMs, c.startMs);
      cur.maxEndMs = Math.max(cur.maxEndMs, c.endMs);
      data.durationMs = Math.max(data.durationMs, c.endMs);
    } else {
      close();
      const h = /^\[(.+)\]$/.exec(text.trim());
      if (h) {
        keep = KEPT.has(h[1].trim().toLowerCase());
        if (h[1].trim().toLowerCase() === 'fonts') data.fonts = { off, len: 0 };
        else if (data.fonts && !fontsEnd) fontsEnd = true;
      }
      if (data.fonts && !fontsEnd) data.fonts.len = off + size - data.fonts.off;
      if (keep && headerBytes < maxHeader) {
        header.push(text);
        headerBytes += bytes.length + 1;
      }
    }
    off += size;
  };
  const reader = file.stream().getReader();
  let first = true;
  for (;;) {
    if (opts.signal?.aborted) {
      void reader.cancel();
      fail('ABORTED', 'indexing was cancelled');
    }
    const { done, value } = await reader.read();
    if (done) break;
    done2 += value.length;
    opts.onProgress?.(done2, file.size);
    let chunk = value;
    if (first && chunk.length >= 3 && chunk[0] === 0xef && chunk[1] === 0xbb && chunk[2] === 0xbf) {
      chunk = chunk.subarray(3);
      off = 3;
    }
    if (chunk.length) first = false;
    sp.push(chunk, onLine);
  }
  sp.end(onLine);
  close();
  data.header = header.join('\n');
  data.formats = sc.formats.map((f) => f.names.join(','));
  return new AssIndex(data, file);
};
