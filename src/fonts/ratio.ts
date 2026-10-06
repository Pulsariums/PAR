import type { FaceMetrics } from './types';

/** Fallback `\fs` to CSS font-size factor when no metrics are known (typical Arial-like ascent+descent ~ 1.11 em). */
export const DEFAULT_RATIO = 0.9;

const usable = (r: number): number | null => (Number.isFinite(r) && r > 0.05 && r < 20 ? r : null);

/**
 * CSS font-size per `\fs` unit for a face: `unitsPerEm / (ascent + descent)`.
 *
 * Source: libass `set_font_metrics` + `ass_face_set_size` (libass/ass_font.c, master as read on 2026-10-06).
 * libass overwrites FreeType's ascender/descender with OS/2 usWinAscent/usWinDescent (signed 16-bit, "mimicking GDI"),
 * then requests the size with FT_SIZE_REQUEST_TYPE_REAL_DIM, so (ascender - descender) == `\fs`.
 * Fallbacks, in libass order: FreeType's own values (hhea; OS/2 typo when hhea is empty), then OS/2 typo, then head bbox.
 */
export const sizeRatio = (m: FaceMetrics | null): number | null => {
  if (!m || m.unitsPerEm <= 0) return null;
  const sums = [
    m.winAscent + m.winDescent,
    m.hheaAscent - m.hheaDescent,
    m.typoAscent - m.typoDescent,
    m.bboxYMax - m.bboxYMin,
  ];
  const cell = sums.find((s) => s > 0);
  return cell === undefined ? null : usable(m.unitsPerEm / cell);
};
