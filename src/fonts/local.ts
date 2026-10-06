/** Local Font Access API (`queryLocalFonts`, Chromium, needs a permission prompt + user gesture). Optional everywhere. */

export interface LocalFontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
  blob(): Promise<Blob>;
}

/** Installed fonts, or null when the API is missing, permission is denied or no user gesture is active. */
export const queryLocal = async (): Promise<LocalFontData[] | null> => {
  const q = (globalThis as { queryLocalFonts?: () => Promise<LocalFontData[]> }).queryLocalFonts;
  if (typeof q !== 'function') return null;
  try {
    return await q.call(globalThis);
  } catch {
    return null;
  }
};

/** Lookup by family / full / PostScript name (lower case). A family match returns every style of it. */
export const findLocal = (all: readonly LocalFontData[], key: string): LocalFontData[] => {
  const fam = all.filter((f) => f.family.toLowerCase() === key);
  if (fam.length) return fam;
  return all.filter((f) => f.fullName.toLowerCase() === key || f.postscriptName.toLowerCase() === key);
};

/** Local faces to load for the script: one hit list per used name that `covered` leaves open and that is installed. */
export const localMatches = (
  usage: ReadonlyMap<string, { name: string }>,
  all: readonly LocalFontData[],
  covered: (key: string, use: { name: string }) => boolean,
  tried: Set<string>,
): LocalFontData[][] => {
  const out: LocalFontData[][] = [];
  for (const [key, use] of usage) {
    if (tried.has(key) || covered(key, use)) continue;
    tried.add(key);
    const hits = findLocal(all, key);
    if (hits.length) out.push(hits);
  }
  return out;
};
