import type { SpriteSpec } from '../types';

/** A font face the worker registers (`FontFace` from the bytes the main thread already loaded). */
export interface FaceData { key: string; family: string; weight: number; italic: boolean; data: ArrayBuffer }

/** `prio`: the worker builds the lowest first (the page sends the time the sprite is first drawn; a sprite a frame is waiting for goes before everything). */
export interface Job { id: number; spec: SpriteSpec; prio: number }

export interface Built {
  id: number;
  /** Null when the worker could not build it (too large, no canvas, an exception): the main thread builds it itself, so a worker-side failure is never remembered as "unbuildable". */
  bitmap: ImageBitmap | null;
  w: number; h: number; boxW: number; ox: number; oy: number; bytes: number;
}

/** Main thread -> sprite worker. */
export type ToSprite =
  | { op: 'init' }
  | { op: 'fonts'; add: FaceData[]; remove: string[] }
  /** Jobs join the worker's own queue, built by priority in slices between messages. */
  | { op: 'build'; gen: number; jobs: Job[] }
  /** Queued jobs of an older generation are not wanted (a seek or a font change): drop them without building. */
  | { op: 'drop'; gen: number };

/** Sprite worker -> main thread. */
export type FromSprite =
  /** `ok`: the worker can draw canvas text at all. `blur`: its `ctx.filter` really blurs (probed with pixels); without it blurred sprites stay on the main thread. */
  | { op: 'ready'; ok: boolean; blur: boolean }
  /** Faces (keys) the worker could not register: sprites with those families would be drawn in a fallback font, so the pool stops taking them. */
  | { op: 'faces'; failed: string[] }
  | { op: 'built'; gen: number; items: Built[] }
  /** `n` queued jobs were discarded unbuilt (they belonged to an older generation). */
  | { op: 'dropped'; n: number };
