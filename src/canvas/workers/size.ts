/** `'auto'` sizes the pool from the machine, `'off'` / 0 keeps every sprite on the main thread, a number asks for that many (at most 4). Only tests and benches pick anything but `'auto'`. */
export type SpriteWorkers = 'auto' | 'off' | number;

export const MAX_WORKERS = 4;

/**
 * Workers to run: none without OffscreenCanvas and Workers, and none on a single core (a worker would only take the page thread's
 * time slices); 1 on two cores or when the core count is unknown (the page thread keeps the other core); otherwise half the cores, at
 * most 4 (the compositor and the page thread need room too). Little memory (`navigator.deviceMemory`, GB) caps it further: every
 * worker holds its own canvases, masks and fonts.
 */
export const poolSize = (opt: SpriteWorkers, cores: number | undefined, available: boolean, memoryGB?: number): number => {
  if (!available || opt === 'off') return 0;
  if (typeof opt === 'number') return Math.max(0, Math.min(MAX_WORKERS, Math.round(opt)));
  if (cores === 1) return 0;
  const n = !cores || cores <= 2 ? 1 : Math.min(MAX_WORKERS, Math.max(2, Math.floor(cores / 2)));
  return memoryGB !== undefined && memoryGB <= 2 ? 1 : memoryGB !== undefined && memoryGB <= 4 ? Math.min(n, 2) : n;
};

/** Workers and OffscreenCanvas exist here (not jsdom, not SSR). */
export const workersAvailable = (): boolean =>
  typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof FontFace === 'function' && typeof navigator !== 'undefined' && !/jsdom/i.test(navigator.userAgent);

/** Internal switch for tests and benches (`globalThis.__PAR_SPRITE_WORKERS = 'off' | n`); not part of the API. Users always get 'auto'. */
export const debugWorkers = (): SpriteWorkers => {
  const v = (globalThis as { __PAR_SPRITE_WORKERS?: unknown }).__PAR_SPRITE_WORKERS;
  return v === 'off' || typeof v === 'number' ? v : 'auto';
};
