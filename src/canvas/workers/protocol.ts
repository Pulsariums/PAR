import type { SpriteSpec } from '../types';

/** A font face the worker registers (`FontFace` from the bytes the main thread already loaded). */
export interface FaceData { key: string; family: string; weight: number; italic: boolean; data: ArrayBuffer }

export interface Job { id: number; spec: SpriteSpec }

export interface Built {
  id: number;
  /** Null when the sprite could not be built (too large, no canvas): the main thread remembers that like a failed build. */
  bitmap: ImageBitmap | null;
  w: number; h: number; boxW: number; ox: number; oy: number; bytes: number;
}

/** Main thread -> sprite worker. */
export type ToSprite =
  | { op: 'init' }
  | { op: 'fonts'; add: FaceData[]; remove: string[] }
  | { op: 'build'; gen: number; jobs: Job[] };

/** Sprite worker -> main thread. */
export type FromSprite =
  | { op: 'ready'; ok: boolean }
  | { op: 'built'; gen: number; items: Built[] };
