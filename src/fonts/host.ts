/** Thin seam over the browser's FontFace API, so the registry also runs (and is tested) without a browser. */

export interface FontFaceLike {
  load(): Promise<unknown>;
}

export interface FontHost {
  create(family: string, data: ArrayBuffer, weight: number, italic: boolean): FontFaceLike;
  add(face: FontFaceLike): void;
  remove(face: FontFaceLike): void;
}

interface FontSetLike {
  add(f: unknown): unknown;
  delete(f: unknown): unknown;
}

/** The real `FontFace` + `document.fonts`, or null where they do not exist (SSR, jsdom). */
export const browserHost = (): FontHost | null => {
  const FF = (globalThis as { FontFace?: new (family: string, source: ArrayBuffer, d: Record<string, string>) => FontFaceLike }).FontFace;
  const set = (typeof document !== 'undefined' ? (document as { fonts?: FontSetLike }).fonts : undefined) ?? null;
  if (typeof FF !== 'function' || !set) return null;
  return {
    create: (family, data, weight, italic) => new FF(family, data, { weight: String(weight), style: italic ? 'italic' : 'normal', display: 'block' }),
    add: (f) => { set.add(f); },
    remove: (f) => { set.delete(f); },
  };
};
