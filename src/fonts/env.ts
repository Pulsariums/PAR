import { createProbe, type FontProbe } from './probe';
import { resolveFont, type Resolved } from './resolver';

/** What the renderer needs from the font layer: one synchronous, cached lookup per (name, bold, italic). */
export interface FontEnv {
  resolve(fn: string, bold: number, italic: boolean): Resolved;
}

/** Pool-less environment: only `fontMap` and system fonts (no loaded faces). Used where no FontManager exists. */
export const staticFontEnv = (fontMap: Record<string, string> = {}, probe: FontProbe = createProbe()): FontEnv => {
  const map = Object.fromEntries(Object.entries(fontMap).map(([k, v]) => [k.trim().toLowerCase(), v]));
  const cache = new Map<string, Resolved>();
  return {
    resolve(fn, bold, italic) {
      const key = `${fn}\0${bold}\0${italic}`;
      let r = cache.get(key);
      if (!r) cache.set(key, (r = resolveFont({ faces: [], fontMap: map, probe }, fn, bold, italic)));
      return r;
    },
  };
};
