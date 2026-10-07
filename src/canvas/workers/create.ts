import SpriteWorker from './sprite.worker?worker&inline';
import { SpritePool, type PoolHooks } from './pool';
import { poolSize, workersAvailable, type SpriteWorkers } from './size';

/** The sprite pool for this machine and option, or null (workers unavailable or switched off). The worker code is inlined into the bundle: no extra file to host. */
export const createSpritePool = (opt: SpriteWorkers, hooks: PoolHooks): SpritePool | null => {
  const nav = typeof navigator !== 'undefined' ? (navigator as { hardwareConcurrency?: number; deviceMemory?: number }) : null;
  const n = poolSize(opt, nav?.hardwareConcurrency, workersAvailable(), nav?.deviceMemory);
  if (n === 0) return null;
  try {
    const pool = new SpritePool(() => new SpriteWorker(), n, hooks, (nav?.deviceMemory ?? 8) <= 4 ? 24 << 20 : undefined);
    return pool.dead ? null : pool;
  } catch { return null; }
};
