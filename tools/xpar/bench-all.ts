import type { BenchProfile } from './bench-common';
import { episode } from './bench-episode';
import { textParticles24, textParticles60 } from './bench-particles';
import { vectorShapes24 } from './bench-shapes';

export const PROFILES: BenchProfile[] = [textParticles60, textParticles24, vectorShapes24, episode];
export const profileById = (id: string): BenchProfile | undefined => PROFILES.find((p) => p.id === id);

/** Whole profile as one string (tests and tiny durations only: never for the 100 MB profile). */
export const generateText = (id: string, seconds: number, seed = 1): string => {
  const p = profileById(id);
  if (!p) throw new Error(`unknown profile ${id}`);
  return [...p.generate(seconds, seed)].join('');
};
