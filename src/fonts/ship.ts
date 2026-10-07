import type { Loaded } from './pool';

/** A loaded face with its bytes: what a sprite worker registers with `FontFace` so it draws the same glyphs as the page. */
export interface ShipFace { key: string; family: string; weight: number; italic: boolean; data: Uint8Array }

/** Faces the browser has accepted (not loading, not failed), in the order they were added. */
export const shipFaces = (loaded: ReadonlyMap<string, Loaded>): ShipFace[] =>
  [...loaded.values()].filter((l) => l.face.state === 'loaded').map(({ face }) => ({ key: face.key, family: face.family, weight: face.weight, italic: face.italic, data: face.parsed.data }));
