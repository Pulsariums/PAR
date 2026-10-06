/** Canvas-based knowledge about fonts PAR did not load itself (installed system fonts, page `@font-face`). */

export interface FontProbe {
  /** Is `name` renderable by the browser right now? null = cannot tell (no canvas). */
  installed(name: string): boolean | null;
  /** CSS font-size per `\fs` unit, measured on the face the stack really resolves to; null without canvas. */
  ratio(cssFamily: string, weight: number, italic: boolean): number | null;
  /** Forget cached answers (a font arrived or was removed). */
  clear(): void;
}

type Ctx = Pick<CanvasRenderingContext2D, 'font' | 'measureText'>;

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace']);
const BASES = ['monospace', 'serif', 'sans-serif'];
const SAMPLE = 'mmmmmmmmmmlli0Og@#';

const makeContext = (): Ctx | null => {
  try {
    if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(8, 8).getContext('2d') as unknown as Ctx | null;
    if (typeof document === 'undefined' || /jsdom/i.test(navigator.userAgent)) return null;
    return document.createElement('canvas').getContext('2d');
  } catch {
    return null;
  }
};

export const quoteFamily = (name: string): string => `"${name.replace(/["\\]/g, '')}"`;

export const createProbe = (getCtx: () => Ctx | null = makeContext): FontProbe => {
  let ctx: Ctx | null | undefined;
  const installedCache = new Map<string, boolean | null>();
  const ratioCache = new Map<string, number | null>();
  const context = (): Ctx | null => (ctx === undefined ? (ctx = getCtx()) : ctx);
  const width = (c: Ctx, family: string): number => {
    c.font = `72px ${family}`;
    return c.measureText(SAMPLE).width;
  };
  return {
    installed(name) {
      const key = name.toLowerCase();
      if (GENERIC.has(key)) return true;
      if (installedCache.has(key)) return installedCache.get(key)!;
      const c = context();
      const found = c ? BASES.some((b) => width(c, `${quoteFamily(name)}, ${b}`) !== width(c, b)) : null;
      installedCache.set(key, found);
      return found;
    },
    clear() {
      installedCache.clear();
      ratioCache.clear();
    },
    ratio(css, weight, italic) {
      const key = `${italic ? 'i' : 'n'}${weight}|${css}`;
      if (ratioCache.has(key)) return ratioCache.get(key)!;
      const c = context();
      let r: number | null = null;
      if (c) {
        c.font = `${italic ? 'italic ' : ''}${weight} 100px ${css}`;
        const m = c.measureText('Hg');
        const cell = (m.fontBoundingBoxAscent ?? 0) + (m.fontBoundingBoxDescent ?? 0);
        r = cell > 0 ? 100 / cell : null;
      }
      ratioCache.set(key, r);
      return r;
    },
  };
};
