import { ByteReader, ByteWriter } from './bytes';
import { fail, LIMITS } from './errors';

export interface ChunkRef {
  offset: number;
  len: number;
  rawLen: number;
  codec: number;
  /** 0 = ordinary events, 1 = long-lived events (kept apart so one sign does not widen every chunk). */
  lane: number;
  count: number;
  minStartMs: number;
  maxEndMs: number;
  minLine: number;
  maxLine: number;
  crc: number;
}

export interface FontRef {
  name: string;
  offset: number;
  len: number;
  crc: number;
}

export interface MiscLine {
  lineNo: number;
  bytes: Uint8Array;
}

/** Who made the file and from what: enough for a UI to say "lossy, 24 fps, from <hash>". */
export interface Provenance {
  /** 0 = lossless XPAR, 1 = lossy PAR. */
  kind: number;
  /** SHA-256 of the ORIGINAL ASS bytes (for PAR: of the source it was baked from). */
  sha256: Uint8Array;
  srcBytes: number;
  /** Source duration (ms): last event end of the original script. */
  srcDurationMs: number;
  /** Target frame rate x 1000 (0 for lossless files). */
  fpsX1000: number;
  encoder: string;
}

export interface Meta {
  bom: boolean;
  crlf: boolean;
  finalNewline: boolean;
  lines: number;
  events: number;
  dialogues: number;
  durationMs: number;
  formats: string[];
  misc: MiscLine[];
  eolExceptions: number[];
  fonts: FontRef[];
  /** Free-form JSON of the lossy baker (target fps, tolerances); empty for lossless files. */
  params: string;
  prov: Provenance | null;
}

const S_INFO = 1;
const S_FORMATS = 2;
const S_MISC = 3;
const S_EOL = 4;
const S_FONTS = 5;
const S_PARAMS = 6;
const S_PROV = 7;

const section = (out: ByteWriter, id: number, fill: (w: ByteWriter) => void): void => {
  const w = new ByteWriter(64);
  fill(w);
  out.uv(id);
  out.uv(w.len);
  out.bytes(w.view());
};

/** Sections are `id,len,body`; readers skip ids they do not know (forward compatibility). */
export const encodeMeta = (m: Meta): Uint8Array => {
  const out = new ByteWriter(1024);
  section(out, S_INFO, (w) => {
    w.u8((m.bom ? 1 : 0) | (m.crlf ? 2 : 0) | (m.finalNewline ? 4 : 0));
    for (const v of [m.lines, m.events, m.dialogues, m.durationMs]) w.uv(v);
  });
  section(out, S_FORMATS, (w) => {
    w.uv(m.formats.length);
    for (const f of m.formats) w.str(f);
  });
  section(out, S_MISC, (w) => {
    w.uv(m.misc.length);
    let prev = -1;
    for (const l of m.misc) {
      w.sv(l.lineNo - prev - 1);
      prev = l.lineNo;
      w.uv(l.bytes.length);
      w.bytes(l.bytes);
    }
  });
  if (m.eolExceptions.length) {
    section(out, S_EOL, (w) => {
      w.uv(m.eolExceptions.length);
      let prev = -1;
      for (const l of m.eolExceptions) {
        w.uv(l - prev - 1);
        prev = l;
      }
    });
  }
  if (m.fonts.length) {
    section(out, S_FONTS, (w) => {
      w.uv(m.fonts.length);
      for (const f of m.fonts) {
        w.str(f.name);
        w.u64(f.offset);
        w.u32(f.len);
        w.u32(f.crc);
      }
    });
  }
  if (m.params) section(out, S_PARAMS, (w) => w.str(m.params));
  if (m.prov) {
    const v = m.prov;
    section(out, S_PROV, (w) => {
      w.u8(v.kind);
      w.bytes(v.sha256);
      w.uv(v.srcBytes);
      w.uv(v.srcDurationMs);
      w.uv(v.fpsX1000);
      w.str(v.encoder);
    });
  }
  return out.view();
};

export const decodeMeta = (buf: Uint8Array): Meta => {
  const m: Meta = { bom: false, crlf: false, finalNewline: false, lines: 0, events: 0, dialogues: 0, durationMs: 0, formats: [], misc: [], eolExceptions: [], fonts: [], params: '', prov: null };
  const r = new ByteReader(buf);
  let sawInfo = false;
  while (r.left > 0) {
    const id = r.uv();
    const len = r.uv();
    const s = new ByteReader(r.bytes(len));
    if (id === S_INFO) {
      const f = s.u8();
      m.bom = (f & 1) !== 0;
      m.crlf = (f & 2) !== 0;
      m.finalNewline = (f & 4) !== 0;
      m.lines = s.uv();
      m.events = s.uv();
      m.dialogues = s.uv();
      m.durationMs = s.uv();
      sawInfo = true;
    } else if (id === S_FORMATS) {
      const n = s.uv();
      if (n > 65536) fail('LIMIT', 'too many formats');
      for (let i = 0; i < n; i++) m.formats.push(s.str(65536));
    } else if (id === S_MISC) {
      const n = s.uv();
      let prev = -1;
      for (let i = 0; i < n; i++) {
        const lineNo = prev + 1 + s.sv();
        prev = lineNo;
        const l = s.uv();
        if (l > LIMITS.maxLineBytes) fail('LIMIT', 'line too long');
        m.misc.push({ lineNo, bytes: s.bytes(l) });
      }
    } else if (id === S_EOL) {
      const n = s.uv();
      let prev = -1;
      for (let i = 0; i < n; i++) {
        prev += 1 + s.uv();
        m.eolExceptions.push(prev);
      }
    } else if (id === S_FONTS) {
      const n = s.uv();
      if (n > LIMITS.maxFonts) fail('LIMIT', 'too many fonts');
      for (let i = 0; i < n; i++) m.fonts.push({ name: s.str(4096), offset: s.u64(), len: s.u32(), crc: s.u32() });
    } else if (id === S_PARAMS) m.params = s.str(1 << 20);
    else if (id === S_PROV) m.prov = { kind: s.u8(), sha256: s.bytes(32).slice(), srcBytes: s.uv(), srcDurationMs: s.uv(), fpsX1000: s.uv(), encoder: s.str(256) };
  }
  if (!sawInfo) fail('CORRUPT', 'meta block has no info section');
  return m;
};

export const encodeIndex = (chunks: ChunkRef[]): Uint8Array => {
  const w = new ByteWriter(64 + chunks.length * 24);
  w.uv(chunks.length);
  let end = 0;
  for (const c of chunks) {
    w.sv(c.offset - end);
    end = c.offset + c.len;
    w.uv(c.len);
    w.uv(c.rawLen);
    w.u8(c.codec);
    w.u8(c.lane);
    w.uv(c.count);
    w.sv(c.minStartMs);
    w.uv(Math.max(0, c.maxEndMs - c.minStartMs));
    w.sv(c.minLine);
    w.uv(c.maxLine - c.minLine);
    w.u32(c.crc);
  }
  return w.view();
};

export const decodeIndex = (buf: Uint8Array, dataStart: number, dataEnd: number): ChunkRef[] => {
  const r = new ByteReader(buf);
  const n = r.uv();
  if (n > LIMITS.maxIndexEntries) fail('LIMIT', 'too many chunks');
  const out: ChunkRef[] = [];
  let end = 0;
  for (let i = 0; i < n; i++) {
    const offset = end + r.sv();
    const len = r.uv();
    end = offset + len;
    const rawLen = r.uv();
    if (offset < dataStart || end > dataEnd) fail('CORRUPT', 'chunk outside the data area');
    if (rawLen > LIMITS.maxChunkRaw) fail('LIMIT', 'chunk too large');
    const codec = r.u8();
    const lane = r.u8();
    const count = r.uv();
    if (count > LIMITS.maxEvents) fail('LIMIT', 'too many events in a chunk');
    const minStartMs = r.sv();
    const maxEndMs = minStartMs + r.uv();
    const minLine = r.sv();
    const maxLine = minLine + r.uv();
    out.push({ offset, len, rawLen, codec, lane, count, minStartMs, maxEndMs, minLine, maxLine, crc: r.u32() });
  }
  return out;
};
