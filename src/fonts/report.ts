import type { FontManager } from './FontManager';
import type { FontReport, FontReportEntry } from './types';

/**
 * Report for the current script: every font a text fragment needs, how it resolves, and who uses it.
 * Statuses: embedded / user / local (a loaded face), system (installed, or assumed when unverifiable),
 * missing (not installed: the generic fallback is drawn instead).
 */
export const buildReport = (fm: FontManager): FontReport => {
  const fonts: FontReportEntry[] = [];
  for (const use of fm.fontUsage.values()) {
    const looks = [...use.looks.values()].map((l) => fm.resolve(use.name, l.b, l.i));
    const first = looks[0];
    if (!first) continue;
    fonts.push({
      name: use.name,
      status: first.status,
      family: first.family,
      verified: first.verified,
      mapped: first.mapped,
      syntheticBold: looks.some((r) => r.syntheticBold),
      syntheticItalic: looks.some((r) => r.syntheticItalic),
      sizeRatio: first.ratio,
      ratioSource: first.ratioSource,
      styles: [...use.styles].sort(),
      lines: [...use.lines].sort((a, b) => a - b),
    });
  }
  fonts.sort((a, b) => a.name.localeCompare(b.name));
  return { fonts, missing: fonts.filter((f) => f.status === 'missing').map((f) => f.name), pending: fm.blocking, warnings: fm.warnings };
};
