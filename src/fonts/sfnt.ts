import { inflate, tag, u16, u32, type Inflater } from './bytes';

/** The tables PAR reads (name, head, hhea, OS/2, cmap), plus (for TTC members) the face re-packed as a standalone sfnt. */
export interface RawFace {
  tables: Map<string, Uint8Array>;
  /** Only for TTC members: browsers load a collection's first face only, so each member is extracted. */
  standalone?: Uint8Array;
}

const NEEDED = new Set(['name', 'head', 'hhea', 'OS/2', 'cmap']);
const MAX_FACES = 64;

/** WOFF2 known-tag table (W3C WOFF2 spec, section 5.1); index 63 means an explicit 4-byte tag follows. */
const W2_TAGS = 'cmap head hhea hmtx maxp name OS/2 post cvt  fpgm glyf loca prep CFF  VORG EBDT EBLC gasp hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL SVG  sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill'
  .match(/.{4}(?: |$)/g)!.map((s) => s.slice(0, 4));

const isSfntSig = (b: Uint8Array): boolean => u32(b, 0) === 0x00010000 || ['OTTO', 'true', 'typ1'].includes(tag(b, 0));

/** Table directory of the sfnt at `off`: tag, absolute offset, length. */
const directory = (b: Uint8Array, off: number): Array<[string, number, number]> => {
  const n = Math.min(u16(b, off + 4), 512);
  const out: Array<[string, number, number]> = [];
  for (let i = 0; i < n; i++) {
    const r = off + 12 + i * 16;
    out.push([tag(b, r), u32(b, r + 8), u32(b, r + 12)]);
  }
  return out;
};

/** Re-packs one TTC member as a standalone TrueType/OpenType font (checksums copied, offsets rebuilt). */
const extract = (b: Uint8Array, off: number): Uint8Array => {
  const dir = directory(b, off);
  const head = 12 + dir.length * 16;
  const total = dir.reduce((s, [, , len]) => s + ((len + 3) & ~3), head);
  const out = new Uint8Array(total);
  out.set(b.subarray(off, off + 12));
  let pos = head;
  dir.forEach(([, o, len], i) => {
    const r = 12 + i * 16;
    out.set(b.subarray(off + 12 + i * 16, off + 12 + i * 16 + 16), r);
    const view = new DataView(out.buffer);
    view.setUint32(r + 8, pos);
    view.setUint32(r + 12, len);
    out.set(b.subarray(o, o + len), pos);
    pos += (len + 3) & ~3;
  });
  return out;
};

const sfntFace = (b: Uint8Array, off: number, standalone: boolean): RawFace => {
  const tables = new Map<string, Uint8Array>();
  for (const [t, o, len] of directory(b, off)) if (NEEDED.has(t)) tables.set(t, b.subarray(o, o + len));
  return standalone ? { tables, standalone: extract(b, off) } : { tables };
};

const woff1 = async (b: Uint8Array, inf: Inflater): Promise<RawFace[]> => {
  const tables = new Map<string, Uint8Array>();
  const n = Math.min(u16(b, 12), 512);
  for (let i = 0; i < n; i++) {
    const r = 44 + i * 20;
    const t = tag(b, r);
    if (!NEEDED.has(t)) continue;
    const [o, comp, orig] = [u32(b, r + 4), u32(b, r + 8), u32(b, r + 12)];
    const raw = b.subarray(o, o + comp);
    tables.set(t, comp < orig ? await inf(raw, 'deflate') : raw);
  }
  return [{ tables }];
};

const base128 = (b: Uint8Array, p: number): [number, number] => {
  let v = 0;
  for (let i = 0; i < 5 && p < b.length; i++) {
    const c = b[p++];
    v = v * 128 + (c & 0x7f);
    if (!(c & 0x80)) break;
  }
  return [v, p];
};

/** WOFF2 needs Brotli (`DecompressionStream('brotli')`); throws where the runtime lacks it. */
const woff2 = async (b: Uint8Array, inf: Inflater): Promise<RawFace[]> => {
  if (tag(b, 4) === 'ttcf') return [];
  const n = Math.min(u16(b, 12), 512);
  let p = 48;
  const entries: Array<[string, number]> = [];
  for (let i = 0; i < n; i++) {
    const flags = b[p++];
    let t = W2_TAGS[flags & 0x3f];
    if ((flags & 0x3f) === 63) { t = tag(b, p); p += 4; }
    const version = flags >> 6;
    let len: number;
    [len, p] = base128(b, p);
    const transformed = t === 'glyf' || t === 'loca' ? version === 0 : version !== 0;
    if (transformed) [len, p] = base128(b, p);
    entries.push([t, len]);
  }
  const data = await inf(b.subarray(p, p + u32(b, 20)), 'brotli');
  const tables = new Map<string, Uint8Array>();
  let pos = 0;
  for (const [t, len] of entries) {
    if (NEEDED.has(t)) tables.set(t, data.subarray(pos, pos + len));
    pos += len;
  }
  return [{ tables }];
};

/** Faces of a TTF / OTF / TTC / WOFF / WOFF2 file; `[]` when the signature is unknown. */
export const readFaces = async (data: Uint8Array, inf: Inflater = inflate): Promise<RawFace[]> => {
  const sig = tag(data, 0);
  if (sig === 'ttcf') {
    const n = Math.min(u32(data, 8), MAX_FACES);
    return Array.from({ length: n }, (_, i) => sfntFace(data, u32(data, 12 + i * 4), true));
  }
  if (sig === 'wOFF') return woff1(data, inf);
  if (sig === 'wOF2') return woff2(data, inf);
  return isSfntSig(data) ? [sfntFace(data, 0, false)] : [];
};
