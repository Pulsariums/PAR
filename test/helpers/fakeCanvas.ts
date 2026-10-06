import { vi } from 'vitest';

/** OffscreenCanvas double: only the names in `installed` measure differently from the generic bases (so the probe finds them). */
export const installCanvas = (installed: string[]): void => {
  class Canvas {
    getContext() {
      let font = '';
      return {
        set font(v: string) { font = v; },
        get font() { return font; },
        measureText: () => {
          const first = /"([^"]+)"/.exec(font)?.[1];
          return { width: first && installed.includes(first) ? 123 : font.includes('monospace') ? 100 : font.includes('serif') && !font.includes('sans-serif') ? 90 : 80, fontBoundingBoxAscent: 90, fontBoundingBoxDescent: 30 };
        },
      };
    }
  }
  vi.stubGlobal('OffscreenCanvas', Canvas);
};
