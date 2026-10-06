import type { FontInput } from './types';

/** What a provider hands back: anything `addFont` accepts (bytes, Blob, URL string, or a .zip of fonts). */
export type FontSource = FontInput;

/** The face PAR wants: `weight` is a CSS weight (400 normal, 700 bold), `italic` the requested slope. */
export interface FontRequest {
  weight: number;
  italic: boolean;
}

/**
 * A source of fonts PAR may ask for when a script names a family nothing loaded covers (a font library, a URL map,
 * a host's own cache ...). PAR stays autonomous: it only calls these methods, it never knows what is behind them.
 *
 * Order of resolution (see README "Fonts"): user / embedded faces, `fontMap`, **providers in array order**, installed
 * fonts via `useLocalFonts`, system fonts, generic fallback.
 */
export interface FontProvider {
  /** Shown in preflight reports (`providerHits`) and warnings. */
  name: string;
  /** Cheap existence check. Optional: when present and false, `get` is not called. `family` has no leading `@`. */
  has?(family: string): Promise<boolean>;
  /** The best matching face for `family` (match case-insensitively), or null when this provider does not have it. */
  get(family: string, request: FontRequest): Promise<FontSource | null>;
  /** Optional: call `fn` whenever the provider's contents change (a font was added). PAR then asks again for fonts still missing. */
  subscribe?(fn: () => void): () => void;
}
