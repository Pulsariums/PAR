import type { FaceData, FromSprite, Built, ToSprite } from './protocol';
import type { SpriteSpec } from '../types';

/** What the sprite host needs from its environment (the real worker wires the canvas raster; tests wire doubles). */
export interface HostDeps {
  supported(): boolean;
  /** Builds a sprite and hands its bitmap over (or null). */
  build(spec: SpriteSpec): Omit<Built, 'id'> | null;
  addFace(f: FaceData): Promise<void>;
  removeFace(key: string): void;
}

export interface HostScope {
  postMessage(m: FromSprite, transfer?: Transferable[]): void;
  addEventListener(type: 'message', fn: (e: { data: ToSprite }) => void): void;
}

/**
 * The sprite worker's message loop. Fonts are registered in message order and every build waits for the fonts sent before it:
 * a sprite rasterised before its font arrived would cache the fallback glyphs.
 */
export const attachSpriteHost = (scope: HostScope, deps: HostDeps): void => {
  let fonts: Promise<unknown> = Promise.resolve();
  scope.addEventListener('message', ({ data: m }) => {
    if (m.op === 'init') scope.postMessage({ op: 'ready', ok: deps.supported() });
    else if (m.op === 'fonts') {
      m.remove.forEach((k) => deps.removeFace(k));
      fonts = fonts.then(() => Promise.all(m.add.map((f) => deps.addFace(f).catch(() => undefined))));
    } else if (m.op === 'build') {
      void fonts.then(() => {
        const items: Built[] = m.jobs.map((j) => {
          try {
            const b = deps.build(j.spec);
            return b ? { id: j.id, ...b } : { id: j.id, bitmap: null, w: 0, h: 0, boxW: 0, ox: 0, oy: 0, bytes: 0 };
          } catch { return { id: j.id, bitmap: null, w: 0, h: 0, boxW: 0, ox: 0, oy: 0, bytes: 0 }; }
        });
        scope.postMessage({ op: 'built', gen: m.gen, items }, items.flatMap((i) => (i.bitmap ? [i.bitmap] : [])));
      });
    }
  });
};
