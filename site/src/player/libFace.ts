import { hasCp, type FontLibrary, type FontRecord } from '../../../src/fontlib';
import { el } from './dom';

const families = new Map<string, Promise<string | null>>();
const covs = new Map<string, Promise<Uint32Array | null>>();
const loaded = new Map<string, FontFace>();

/** The page-level CSS family of a stored face (bytes are read and registered on first use only), or null when it cannot be loaded. */
export const faceFamily = (lib: FontLibrary, rec: FontRecord): Promise<string | null> => {
  let p = families.get(rec.id);
  if (!p) {
    p = (async () => {
      const bytes = await lib.bytes(rec.id);
      if (!bytes || typeof FontFace !== 'function') return null;
      const name = `PARLIB-${rec.id.slice(0, 12)}`;
      try {
        const ff = new FontFace(name, bytes.slice().buffer, { weight: String(rec.weight), style: rec.italic ? 'italic' : 'normal' });
        await ff.load();
        document.fonts.add(ff);
        loaded.set(rec.id, ff);
        return name;
      } catch { return null; }
    })();
    families.set(rec.id, p);
  }
  return p;
};

export const faceCoverage = (lib: FontLibrary, id: string): Promise<Uint32Array | null> => {
  let p = covs.get(id);
  if (!p) covs.set(id, (p = lib.coverage(id)));
  return p;
};

/** Forget a deleted face (frees the registered FontFace). */
export const dropFace = (id: string): void => {
  const ff = loaded.get(id);
  if (ff) document.fonts.delete(ff);
  [families, covs, loaded].forEach((m) => m.delete(id));
};

/** Text split per character: `ok` is false where the font has no glyph (whitespace is always ok). */
export const splitPreview = (text: string, cov: Uint32Array | null): Array<{ ch: string; ok: boolean }> =>
  [...text].map((ch) => ({ ch, ok: !cov || /\s/.test(ch) || hasCp(cov, ch.codePointAt(0)!) }));

/** Fills `target` with the text in the face; characters the font lacks become visible boxes instead of silently using a fallback font. */
export const renderPreview = (target: HTMLElement, text: string, cov: Uint32Array | null, family: string | null): void => {
  target.style.fontFamily = family ? `"${family}", monospace` : '';
  target.replaceChildren(...splitPreview(text, cov).map(({ ch, ok }) => {
    if (ok) return document.createTextNode(ch);
    const box = el('span', 'tofu');
    box.title = `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', box.title);
    return box;
  }));
};
