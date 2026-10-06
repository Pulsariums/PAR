/**
 * Builds a tiny valid TrueType font in memory: every printable ASCII character is a solid bar whose height depends on
 * the character, so text set in it is unmistakable next to any real font. Used by the tests and by the playground's
 * "generate a test font" button; it is not part of the public API and tree-shakes out of the library bundle.
 */

export interface TestFontSpec {
  family: string;
  /** Typographic family (nameID 16), when it differs from `family` (nameID 1). */
  typoFamily?: string;
  subfamily?: string;
  fullName?: string;
  weight?: number;
  italic?: boolean;
  unitsPerEm?: number;
  /** Vertical metrics (font units). Distinct sets let tests tell which one a consumer reads. */
  win?: [number, number];
  hhea?: [number, number];
  typo?: [number, number];
  /** Also write Macintosh (platform 1) name records. */
  mac?: boolean;
}

const be = (n: number, size: 2 | 4): number[] => (size === 2 ? [(n >> 8) & 255, n & 255] : [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
const cat = (...parts: number[][]): number[] => parts.flat();
const pad4 = (a: number[]): number[] => [...a, ...new Array((4 - (a.length % 4)) % 4).fill(0)];
const utf16 = (s: string): number[] => Array.from({ length: s.length }, (_, i) => be(s.charCodeAt(i), 2)).flat();

const GLYPHS = 96; // .notdef, space, 0x21..0x7E
const ADVANCE = 600;

const glyf = (upem: number): { glyf: number[]; loca: number[] } => {
  const chunks: number[][] = [];
  for (let g = 0; g < GLYPHS; g++) {
    if (g === 1) { chunks.push([]); continue; }
    const h = g === 0 ? Math.round(upem * 0.7) : Math.round(upem * (0.25 + 0.1 * ((g * 7) % 6)));
    const w = ADVANCE - 100;
    chunks.push(pad4(cat(
      be(1, 2), be(50, 2), be(0, 2), be(w - 50, 2), be(h, 2), be(3, 2), be(0, 2), [1, 1, 1, 1],
      be(50, 2), be(0, 2), be(w - 100, 2), be(0, 2), // x deltas
      be(0, 2), be(h, 2), be(0, 2), be(-h & 0xffff, 2), // y deltas
    )));
  }
  let off = 0;
  const loca = chunks.flatMap((c) => { const o = off; off += c.length; return be(o, 4); }).concat(be(off, 4));
  return { glyf: chunks.flat(), loca };
};

const nameTable = (s: TestFontSpec): number[] => {
  const sub = s.subfamily ?? 'Regular';
  const entries: Array<[number, string]> = [[1, s.family], [2, sub], [4, s.fullName ?? `${s.family} ${sub}`], [6, `${s.family}-${sub}`.replace(/\s+/g, '')]];
  if (s.typoFamily) entries.push([16, s.typoFamily], [17, sub]);
  const recs: Array<[number, number, number, number, number[]]> = [];
  for (const [id, text] of entries) {
    recs.push([3, 1, 0x409, id, utf16(text)]);
    if (s.mac) recs.push([1, 0, 0, id, [...text].map((c) => c.charCodeAt(0) & 255)]);
  }
  let off = 0;
  const dir = recs.flatMap(([p, e, l, id, data]) => { const r = cat(be(p, 2), be(e, 2), be(l, 2), be(id, 2), be(data.length, 2), be(off, 2)); off += data.length; return r; });
  return cat(be(0, 2), be(recs.length, 2), be(6 + recs.length * 12, 2), dir, ...recs.map((r) => r[4]));
};

const checksum = (a: number[]): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) sum = (sum + ((a[i] << 24) | (a[i + 1] << 16) | (a[i + 2] << 8) | a[i + 3])) >>> 0;
  return sum;
};

/** Raw table bytes by tag (not yet padded). */
export const testFontTables = (s: TestFontSpec): Array<[string, number[]]> => {
  const upem = s.unitsPerEm ?? 1000;
  const win = s.win ?? [800, 200];
  const hhea = s.hhea ?? win;
  const typo = s.typo ?? win;
  const weight = s.weight ?? 400;
  const g = glyf(upem);
  const bold = weight >= 600;
  const sel = (s.italic ? 1 : 0) | (bold ? 32 : 0) | (s.italic || bold ? 0 : 64);
  const head = cat(be(0x00010000, 4), be(0, 4), be(0, 4), be(0x5f0f3cf5, 4), be(0x000b, 2), be(upem, 2), new Array(16).fill(0),
    be(0, 2), be(0, 2), be(ADVANCE, 2), be(upem, 2), be((bold ? 1 : 0) | (s.italic ? 2 : 0), 2), be(8, 2), be(2, 2), be(1, 2), be(0, 2));
  const hheaT = cat(be(0x00010000, 4), be(hhea[0], 2), be(-hhea[1] & 0xffff, 2), be(0, 2), be(ADVANCE, 2), be(0, 2), be(0, 2), be(ADVANCE, 2),
    be(1, 2), be(0, 2), be(0, 2), new Array(8).fill(0), be(0, 2), be(GLYPHS, 2));
  const hmtx = Array.from({ length: GLYPHS }, (_, i) => cat(be(i === 1 ? 300 : ADVANCE, 2), be(i === 1 ? 0 : 50, 2))).flat();
  const maxp = cat(be(0x00010000, 4), be(GLYPHS, 2), be(4, 2), be(1, 2), new Array(22).fill(0).map((_, i) => (i === 5 ? 1 : 0)));
  const os2 = cat(be(3, 2), be(ADVANCE, 2), be(weight, 2), be(5, 2), be(0, 2), new Array(20).fill(0), be(0, 2), new Array(10).fill(0), new Array(16).fill(0),
    [...'PAR '].map((c) => c.charCodeAt(0)), be(sel, 2), be(0x20, 2), be(0x7e, 2), be(typo[0], 2), be(-typo[1] & 0xffff, 2), be(0, 2), be(win[0], 2), be(win[1], 2),
    new Array(8).fill(0), be(0, 2), be(0, 2), be(0, 2), be(0x20, 2), be(0, 2));
  const cmap = cat(be(0, 2), be(1, 2), be(3, 2), be(1, 2), be(12, 4), be(4, 2), be(32, 2), be(0, 2), be(4, 2), be(4, 2), be(1, 2), be(0, 2),
    be(0x7e, 2), be(0xffff, 2), be(0, 2), be(0x20, 2), be(0xffff, 2), be((1 - 0x20) & 0xffff, 2), be(1, 2), be(0, 2), be(0, 2));
  const post = cat(be(0x00030000, 4), new Array(28).fill(0));
  return [['OS/2', os2], ['cmap', cmap], ['glyf', g.glyf], ['head', head], ['hhea', hheaT], ['hmtx', hmtx], ['loca', g.loca], ['maxp', maxp], ['name', nameTable(s)], ['post', post]];
};

/** A complete TrueType font file. */
export const buildTestFont = (s: TestFontSpec): Uint8Array<ArrayBuffer> => {
  const tables = testFontTables(s);
  const n = tables.length;
  const dirLen = 12 + n * 16;
  const body: number[] = [];
  const dir: number[] = [];
  let head = -1;
  for (const [tag, data] of tables) {
    if (tag === 'head') head = dirLen + body.length;
    dir.push(...cat([...tag].map((c) => c.charCodeAt(0)), be(checksum(pad4(data)), 4), be(dirLen + body.length, 4), be(data.length, 4)));
    body.push(...pad4(data));
  }
  const out = cat(be(0x00010000, 4), be(n, 2), be(128, 2), be(3, 2), be(n * 16 - 128, 2), dir, body);
  const adj = (0xb1b0afba - checksum(out)) >>> 0;
  out.splice(head + 8, 4, ...be(adj, 4));
  return Uint8Array.from(out);
};

/** Packs fonts into a TrueType Collection (table offsets are rewritten to be file-absolute). */
export const buildTestTtc = (fonts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const headLen = 12 + fonts.length * 4;
  const offsets: number[] = [];
  let pos = headLen;
  for (const f of fonts) { offsets.push(pos); pos += f.length; }
  const out = new Uint8Array(pos);
  const view = new DataView(out.buffer);
  out.set([0x74, 0x74, 0x63, 0x66]);
  view.setUint32(4, 0x00010000);
  view.setUint32(8, fonts.length);
  fonts.forEach((f, i) => {
    view.setUint32(12 + i * 4, offsets[i]);
    out.set(f, offsets[i]);
    const nt = (f[4] << 8) | f[5];
    for (let t = 0; t < nt; t++) view.setUint32(offsets[i] + 12 + t * 16 + 8, new DataView(f.buffer, f.byteOffset).getUint32(12 + t * 16 + 8) + offsets[i]);
  });
  return out;
};
