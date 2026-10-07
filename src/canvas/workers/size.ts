/** `'auto'` sizes the pool from the machine, `'off'` / 0 keeps every sprite on the main thread, a number asks for that many (at most 4). Only tests and benches pick anything but `'auto'`. */
export type SpriteWorkers = 'auto' | 'off' | number;

export const MAX_WORKERS = 4;

/**
 * Workers to run: none without OffscreenCanvas and Workers; 1 on two cores or fewer or when the core count is unknown (the page thread
 * keeps the other core); otherwise half the cores, at most 4 (the compositor and the page thread need room too).
 */
export const poolSize = (opt: SpriteWorkers, cores: number | undefined, available: boolean): number => {
  if (!available || opt === 'off') return 0;
  if (typeof opt === 'number') return Math.max(0, Math.min(MAX_WORKERS, Math.round(opt)));
  if (!cores || cores <= 2) return 1;
  return Math.min(MAX_WORKERS, Math.max(2, Math.floor(cores / 2)));
};

/** Workers and OffscreenCanvas exist here (not jsdom, not SSR). */
export const workersAvailable = (): boolean =>
  typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof FontFace === 'function' && typeof navigator !== 'undefined' && !/jsdom/i.test(navigator.userAgent);

/** Internal switch for tests and benches (`globalThis.__PAR_SPRITE_WORKERS = 'off' | n`); not part of the API. Users always get 'auto'. */
export const debugWorkers = (): SpriteWorkers => {
  const v = (globalThis as { __PAR_SPRITE_WORKERS?: unknown }).__PAR_SPRITE_WORKERS;
  return v === 'off' || typeof v === 'number' ? v : 'auto';
};
