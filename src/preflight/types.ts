import type { FontProvider } from '../fonts/provider';
import type { FontSpec, FontStatus } from '../fonts/types';

/** A family a script uses, how (bold / italic requests), where and how often. Keyed by lower-case family name. */
export interface UsedFont {
  /** First spelling in the script (without `@`). */
  name: string;
  /** Distinct (bold, italic) requests, keyed `"b|i"`. */
  looks: Map<string, { b: number; i: boolean }>;
  styles: Set<string>;
  /** Events using the font. */
  lineCount: number;
  /** The first few event indexes (`AssEvent.index`), for "where is it used". */
  sample: number[];
  /** Code points drawn with it. */
  chars: Set<number>;
}

/** Code points a font is asked to draw but does not have. `count` is exact, `sample` is capped (see `MAX_GLYPH_SAMPLE`). */
export interface MissingGlyphs {
  count: number;
  sample: number[];
}

export interface PreflightEntry {
  /** Family as written in the script. */
  name: string;
  status: FontStatus;
  /** CSS family list PAR would use. */
  family: string;
  /** False when `system` / `missing` could not be probed (no canvas): `system` is then an assumption. */
  verified: boolean;
  mapped: boolean;
  syntheticBold: boolean;
  syntheticItalic: boolean;
  styles: string[];
  lineCount: number;
  /** Name of the provider that supplied the face, when one did. */
  provider?: string;
  /** Present only when the font exists as a parsed face (user / embedded / provider / local) and lacks glyphs the script draws. */
  missingGlyphs?: MissingGlyphs;
}

export interface PreflightReport {
  /** True when no font is missing. Missing glyphs and synthetic styles are warnings, not failures. */
  ok: boolean;
  /** Every used font that something serves (including synthetic bold / italic ones). */
  resolved: PreflightEntry[];
  /** Fonts nothing serves: a generic fallback would be drawn. */
  missing: PreflightEntry[];
  /** Resolved fonts where bold and/or italic would be faked. */
  synthetic: PreflightEntry[];
  /** Provider name => families it supplied. */
  providerHits: Record<string, string[]>;
  /** Family (as written) => glyphs the loaded face lacks. Only fonts whose glyph table is known appear here. */
  missingGlyphs: Record<string, MissingGlyphs>;
  warnings: string[];
  /** What was scanned. `events` counts Dialogue lines; 0 when only `usedFonts` was given. */
  stats: { lines: number; events: number; fonts: number };
}

export type UsedFontInput = string | { family: string; bold?: number | boolean; italic?: boolean };

/** A script as text, or as lines (sync or async iterable). Chunked streams: wrap them with `linesFromChunks`. */
export type LineSource = string | Iterable<string> | AsyncIterable<string>;

export interface PreflightOptions {
  /** Fonts the host already has (File, Blob, bytes, URL, zip). They count as `user` fonts. */
  fonts?: FontSpec[];
  fontMap?: Record<string, string>;
  fontProviders?: FontProvider[];
  /** Read the script's `[Fonts]` section. Default true. */
  embeddedFonts?: boolean;
  /** Per provider call, ms. Default 5000. */
  providerTimeout?: number;
  /** Families known from elsewhere (e.g. a compressed format's font table). Merged with whatever the text scan finds. */
  usedFonts?: Iterable<UsedFontInput>;
  /** Check glyph coverage (collects every used code point per font). Default true. */
  glyphs?: boolean;
  signal?: AbortSignal;
  /** Called every few thousand lines with the number of lines scanned so far. */
  onProgress?(lines: number): void;
}

/** At most this many missing code points are listed per family. */
export const MAX_GLYPH_SAMPLE = 64;
