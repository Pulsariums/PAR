import SpriteWorker from './sprite.worker?worker&inline';
import { SpritePool, type PoolHooks } from './pool';
import { poolSize, workersAvailable, type SpriteWorkers } from './size';

/** The sprite pool for this machine and option, or null (workers unavailable or switched off). The worker code is inlined into the bundle: no extra file to host. */
export const createSpritePool = (opt: SpriteWorkers, hooks: PoolHooks): SpritePool | null => {
  const n = poolSize(opt, typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined, workersAvailable());
  if (n === 0) return null;
  const pool = new SpritePool(() => new SpriteWorker(), n, hooks);
  return pool.dead ? null : pool;
};
