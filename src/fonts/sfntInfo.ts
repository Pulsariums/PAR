import { i16, macRoman, u16, utf16be } from './bytes';
import type { RawFace } from './sfnt';
import type { FaceInfo, FaceMetrics } from './types';

interface NameRec { id: number; text: string; score: number }

/** All usable strings of the `name` table. Score: Windows English > Unicode > Mac English > other languages. */
const readNames = (t: Uint8Array): NameRec[] => {
  const count = u16(t, 2);
  const base = u16(t, 4);
  const out: NameRec[] = [];
  for (let i = 0; i < count && i < 4096; i++) {
    const r = 6 + i * 12;
    const [plat, enc, lang, id, len, off] = [u16(t, r), u16(t, r + 2), u16(t, r + 4), u16(t, r + 6), u16(t, r + 8), u16(t, r + 10)];
    const start = base + off;
    if (start + len > t.length) continue;
    let text = '';
    let score = 0;
    if (plat === 3 && (enc === 1 || enc === 10 || enc === 0)) { text = utf16be(t, start, len); score = lang === 0x409 ? 4 : 1; }
    else if (plat === 0) { text = utf16be(t, start, len); score = 2; }
    else if (plat === 1 && enc === 0) { text = macRoman(t, start, len); score = lang === 0 ? 3 : 0; }
    else continue;
    text = text.replace(/\0/g, '').trim();
    if (text) out.push({ id, text, score });
  }
  return out;
};

const unique = (xs: string[]): string[] => [...new Set(xs)];
const namesOf = (recs: NameRec[], ...ids: number[]): string[] =>
  ids.flatMap((id) => recs.filter((r) => r.id === id).sort((a, b) => b.score - a.score).map((r) => r.text));

/** libass `ass_face_get_weight`: OS/2 usWeightClass 1..9 are the legacy 100-step codes. */
export const faceWeight = (os2Weight: number, boldFlag: boolean): number => {
  const legacy = [0, 100, 200, 300, 350, 400, 600, 700, 800, 900];
  if (os2Weight === 0) return boldFlag ? 700 : 400;
  return os2Weight <= 9 ? legacy[os2Weight] : os2Weight;
};

export const readMetrics = (face: RawFace): FaceMetrics | null => {
  const head = face.tables.get('head');
  if (!head || head.length < 54) return null;
  const hhea = face.tables.get('hhea');
  const os2 = face.tables.get('OS/2');
  const win = os2 && os2.length >= 78;
  return {
    unitsPerEm: u16(head, 18),
    winAscent: win ? i16(os2, 74) : 0,
    winDescent: win ? i16(os2, 76) : 0,
    hheaAscent: hhea ? i16(hhea, 4) : 0,
    hheaDescent: hhea ? i16(hhea, 6) : 0,
    typoAscent: win ? i16(os2, 68) : 0,
    typoDescent: win ? i16(os2, 70) : 0,
    bboxYMin: i16(head, 38),
    bboxYMax: i16(head, 42),
  };
};

/** Names, weight, slope and vertical metrics of one face. Never throws on truncated tables. */
export const readFaceInfo = (face: RawFace): FaceInfo => {
  const recs = face.tables.has('name') ? readNames(face.tables.get('name')!) : [];
  const families = unique(namesOf(recs, 16, 1));
  const head = face.tables.get('head');
  const os2 = face.tables.get('OS/2');
  const mac = head ? u16(head, 44) : 0;
  const sel = os2 && os2.length >= 64 ? u16(os2, 62) : null;
  const boldFlag = sel !== null ? (sel & 32) !== 0 : (mac & 1) !== 0;
  const italic = sel !== null ? (sel & 1) !== 0 : (mac & 2) !== 0;
  return {
    family: families[0] ?? '',
    families,
    fullNames: unique(namesOf(recs, 4, 6)),
    weight: faceWeight(os2 && os2.length >= 6 ? u16(os2, 4) : 0, boldFlag),
    italic,
    boldFlag,
    metrics: readMetrics(face),
  };
};
