import { buildSprite, type Sprite } from './raster';
import { maskOf, tint } from './tint';
import type { SpriteSpec } from './types';

/** Where finished white masks are kept: the main thread keeps them in its sprite cache, a worker in a cache of its own. */
export interface MaskStore {
  peek(key: string): Sprite | null | undefined;
  /** Builds and stores the mask (not counted as a draw-time miss). */
  store(key: string, build: () => Sprite | null): void;
}

/**
 * Builds the sprite of a spec. Plain single-colour sprites are tinted from a shared white mask (see `tint.ts`): the glyph is
 * rasterised once per shape, each colour is one cheap pass. Used by the canvas path and by the sprite Worker alike.
 */
export const construct = (spec: SpriteSpec, masks: MaskStore): Sprite | null => {
  const m = maskOf(spec);
  if (!m) return buildSprite(spec);
  let mask = masks.peek(m.key);
  if (mask === undefined) {
    masks.store(m.key, () => buildSprite(m.spec));
    mask = masks.peek(m.key);
  }
  return mask ? tint(mask, m.colour) : null;
};
