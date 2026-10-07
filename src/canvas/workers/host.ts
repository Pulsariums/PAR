import type { FaceData, FromSprite, Built, ToSprite } from './protocol';
import type { SpriteSpec } from '../types';

/** What the sprite host needs from its environment (the real worker wires the canvas raster; tests wire doubles). */
export interface HostDeps {
  supported(): boolean;
  /** `ctx.filter` blurs for real here (see `blurWorks`). */
  blur(): boolean;
  /** Builds a sprite and hands its bitmap over (or null). */
  build(spec: SpriteSpec): Omit<Built, 'id'> | null;
  addFace(f: FaceData): Promise<void>;
  removeFace(key: string): void;
  /** The font set changed: everything cached from the old fonts (white masks) is stale. */
  reset(): void;
}

export interface HostScope {
  postMessage(m: FromSprite, transfer?: Transferable[]): void;
  addEventListener(type: 'message', fn: (e: { data: ToSprite }) => void): void;
}

const NONE = { bitmap: null, w: 0, h: 0, boxW: 0, ox: 0, oy: 0, bytes: 0 };

/**
 * The sprite worker's message loop. Font changes (drops, then loads) run in message order and every build waits for the ones sent
 * before it: a sprite rasterised before its font arrived would cache the fallback glyphs. A face that fails to register is reported
 * before any build that follows, so the pool can stop sending sprites that need it.
 */
export const attachSpriteHost = (scope: HostScope, deps: HostDeps): void => {
  let fonts: Promise<unknown> = Promise.resolve();
  scope.addEventListener('message', ({ data: m }) => {
    if (m.op === 'init') scope.postMessage({ op: 'ready', ok: deps.supported(), blur: deps.supported() && deps.blur() });
    else if (m.op === 'fonts') {
      fonts = fonts.then(async () => {
        for (const k of m.remove) { try { deps.removeFace(k); } catch { /* the face stays registered: harmless */ } }
        const failed: string[] = [];
        await Promise.all(m.add.map((f) => deps.addFace(f).catch(() => { failed.push(f.key); })));
        deps.reset();
        if (failed.length) scope.postMessage({ op: 'faces', failed });
      });
    } else if (m.op === 'build') {
      void fonts.then(() => {
        const items: Built[] = m.jobs.map((j) => {
          try {
            const b = deps.build(j.spec);
            return { id: j.id, ...(b ?? NONE) };
          } catch { return { id: j.id, ...NONE }; }
        });
        scope.postMessage({ op: 'built', gen: m.gen, items }, items.flatMap((i) => (i.bitmap ? [i.bitmap] : [])));
      });
    }
  });
};
