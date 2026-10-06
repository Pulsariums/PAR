/** Public font types. */

/** Where a loaded face came from. */
export type FontSourceKind = 'embedded' | 'user' | 'local';

/** Result of resolving an ASS font name. `system` = found on the machine (or unverifiable), `missing` = probe says it is not installed. */
export type FontStatus = FontSourceKind | 'system' | 'missing';

/** Anything `addFont` accepts. A string is fetched as a URL. */
export type FontInput = File | Blob | ArrayBuffer | ArrayBufferView | string | URL;

/** A font to load at construction: the input itself, or the input plus an explicit family name. */
export type FontSpec = FontInput | { source: FontInput; family?: string };

export interface AddFontOptions {
  /** Family name to register under (and to match ASS font names against). Default: read from the font's `name` table. */
  family?: string;
}

/** Vertical metrics in font units, as stored in head / hhea / OS/2. */
export interface FaceMetrics {
  unitsPerEm: number;
  winAscent: number;
  winDescent: number;
  hheaAscent: number;
  hheaDescent: number;
  typoAscent: number;
  typoDescent: number;
  bboxYMin: number;
  bboxYMax: number;
}

/** What PAR learns by parsing one face of a font file. */
export interface FaceInfo {
  /** Primary family (typographic family if present, else legacy family), '' when the file has no usable name. */
  family: string;
  /** Every family name in the file (all languages; nameID 16 and 1). Primary first. */
  families: string[];
  /** Full names and PostScript names (nameID 4 and 6, all languages). */
  fullNames: string[];
  /** CSS-style weight 1..1000 (libass mapping of OS/2 usWeightClass). */
  weight: number;
  italic: boolean;
  /** The face carries a bold style flag (OS/2 fsSelection bit 5 or head macStyle bit 0). */
  boldFlag: boolean;
  metrics: FaceMetrics | null;
}

/** A face PAR has loaded, as shown by `listFonts()`. */
export interface LoadedFont {
  /** Stable id for `removeFont`. */
  id: string;
  /** Family the face is registered under with the browser. */
  family: string;
  /** All names an ASS script may use to reach this face (lower case). */
  aliases: string[];
  weight: number;
  italic: boolean;
  source: FontSourceKind;
  /** File name or URL it came from. */
  label: string;
  state: 'loading' | 'loaded' | 'failed';
  error?: string;
}

/** One entry of `getFontReport().fonts`. */
export interface FontReportEntry {
  /** The name as first written in the script (leading `@` removed). */
  name: string;
  status: FontStatus;
  /** CSS family list used for rendering. */
  family: string;
  /** False when `system`/`missing` could not be probed (no canvas): `system` is then an assumption. */
  verified: boolean;
  /** True when a `fontMap` entry supplied the family. */
  mapped: boolean;
  /** Bold / italic requested by the script but not available as a real face (libass: drawn synthetically). */
  syntheticBold: boolean;
  syntheticItalic: boolean;
  /** `\fs` to CSS size factor and where it came from (see README "Font metrics"). */
  sizeRatio: number;
  ratioSource: 'font-file' | 'canvas' | 'default';
  /** Style names (referenced by at least one event) that use the font. */
  styles: string[];
  /** Events using it: `AssEvent.index` values, ascending. */
  lines: number[];
}

export interface FontReport {
  fonts: FontReportEntry[];
  /** Names with status `missing`. */
  missing: string[];
  /** True while font data is still loading (a re-layout follows). */
  pending: boolean;
  /** Load/parse problems (corrupt embedded fonts etc.). */
  warnings: string[];
}

/** One file's outcome in `addFonts`. */
export interface AddFontsEntry {
  name: string;
  fonts: LoadedFont[];
  error?: string;
}
