import { bake, type Baked } from './bake';
import type { ClipShape } from '../render/clipCss';
import { construct } from './construct';
import type { Sprite } from './raster';
import type { SpriteCache } from './SpriteCache';
import type { DrawItem, SpriteSpec } from './types';

/**
 * Sprite construction on the page thread, for the look-ahead only: the frame path never builds (it looks bitmaps up and draws).
 * Plain single-colour sprites are tinted from a shared white mask kept in the cache (see `construct.ts`). Not counted as draw-time misses.
 */
export const buildAhead = (cache: SpriteCache<Sprite>, key: string, spec: SpriteSpec): void => {
  cache.store(key, () => construct(spec, { peek: (k) => cache.peek(k), store: (k, build) => cache.store(k, build, false) }));
};

/** The clip-cut bitmap of an item whose base sprite is cached (see `bake.ts`): one pass, small, built ahead of the frames that draw it. */
export const bakeAhead = (cache: SpriteCache<Sprite>, key: string, it: DrawItem, clip: ClipShape): boolean => {
  const base = cache.peek(it.key);
  if (!base) return false;
  cache.store(key, () => bake(it, base, clip) as Baked | null);
  return true;
};
