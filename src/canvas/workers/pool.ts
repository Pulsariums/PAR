import { cssFamilies } from '../../fonts/resolver';
import type { Sprite } from '../raster';
import type { SpriteSpec } from '../types';

import type { FaceData, FromSprite, Job, ToSprite } from './protocol';

/** Jobs one worker may hold at once (queued in its mailbox or running): enough to keep it busy between two messages, few enough to stay urgent. */
const PER_WORKER = 16;
const BATCH = 8;
/** Fonts above this size, or beyond this total per worker, stay on the main thread (their sprites are built there). */
const MAX_FACE = 24 << 20;
const MAX_FACES = 64 << 20;

export interface FaceInfo { key: string; family: string; weight: number; italic: boolean; data: Uint8Array }

export interface PoolHooks {
  /** A sprite arrived (null: it cannot be built). Return value unused. */
  built(key: string, s: Sprite | null): void;
  /** Room for more jobs (a message was processed). */
  free(): void;
  /** The pool is unusable (worker error, unsupported): the owner falls back to the main thread. */
  failed(reason: string): void;
}

interface Slot { w: Worker; load: number; sent: Set<string>; ready: boolean }

/**
 * Builds sprites in Workers (OffscreenCanvas) and gets them back as ImageBitmaps. The main thread decides what to build and in which
 * order (the warm plan); the pool only keeps its workers fed with a few jobs each and returns results through `hooks.built`.
 * Anything it cannot do (font not shippable, worker failure) is left to the main-thread path, which stays complete on its own.
 */
export class SpritePool {
  private readonly slots: Slot[];
  private readonly keys = new Map<number, string>();
  private readonly staged: Array<{ job: Job; key: string }> = [];
  private readonly inflight = new Set<string>();
  private readonly blocked = new Set<string>();
  private faces: FaceInfo[] = [];
  private seq = 0;
  private gen = 0;
  dead = false;
  /** Sprites received from workers, for the metrics. */
  received = 0;

  constructor(factory: () => Worker, size: number, private readonly hooks: PoolHooks) {
    this.slots = [];
    try {
      for (let i = 0; i < size; i++) this.slots.push(this.open(factory()));
    } catch (e) { this.fail(e instanceof Error ? e.message : String(e)); }
  }

  get size(): number { return this.slots.length; }
  get ready(): boolean { return !this.dead && this.slots.some((s) => s.ready); }
  get pending(): number { return this.inflight.size; }

  private open(w: Worker): Slot {
    const slot: Slot = { w, load: 0, sent: new Set(), ready: false };
    w.addEventListener('message', (e: MessageEvent<FromSprite>) => this.onMessage(slot, e.data));
    w.addEventListener('error', (e) => this.fail(e.message || 'sprite worker error'));
    w.postMessage({ op: 'init' } satisfies ToSprite);
    return slot;
  }

  private onMessage(slot: Slot, m: FromSprite): void {
    if (m.op === 'ready') {
      if (!m.ok) { this.fail('OffscreenCanvas text is not supported in a worker'); return; }
      slot.ready = true;
      this.syncFaces(slot);
      this.hooks.free();
      return;
    }
    slot.load = Math.max(0, slot.load - m.items.length);
    for (const it of m.items) {
      const key = this.keys.get(it.id);
      this.keys.delete(it.id);
      if (key === undefined) { it.bitmap?.close(); continue; }
      this.inflight.delete(key);
      if (m.gen !== this.gen) { it.bitmap?.close(); continue; }
      this.received++;
      this.hooks.built(key, it.bitmap ? { canvas: it.bitmap, w: it.w, h: it.h, boxW: it.boxW, ox: it.ox, oy: it.oy, bytes: it.bytes } : null);
    }
    this.hooks.free();
  }

  /** The faces the page has loaded; each worker gets the ones it does not have yet and drops the ones gone. */
  setFaces(faces: FaceInfo[]): void {
    this.faces = faces;
    this.blocked.clear();
    let total = 0;
    for (const f of faces) {
      total += f.data.byteLength;
      if (f.data.byteLength > MAX_FACE || total > MAX_FACES) this.blocked.add(f.family.toLowerCase());
    }
    this.slots.forEach((s) => { if (s.ready) this.syncFaces(s); });
  }

  private syncFaces(s: Slot): void {
    const want = new Map(this.faces.filter((f) => !this.blocked.has(f.family.toLowerCase())).map((f) => [f.key, f]));
    const add: FaceData[] = [];
    for (const [k, f] of want) if (!s.sent.has(k)) { add.push({ key: k, family: f.family, weight: f.weight, italic: f.italic, data: f.data.slice().buffer as ArrayBuffer }); s.sent.add(k); }
    const remove = [...s.sent].filter((k) => !want.has(k));
    remove.forEach((k) => s.sent.delete(k));
    if (add.length || remove.length) s.w.postMessage({ op: 'fonts', add, remove } satisfies ToSprite, add.map((a) => a.data));
  }

  /** The primary family of the spec is not one of the oversized fonts that were left out. */
  accepts(spec: SpriteSpec): boolean {
    const first = cssFamilies(spec.family)[0]?.toLowerCase();
    return !(first && this.blocked.has(first));
  }

  /** Room for one more job right now. */
  get capacity(): number { return this.dead ? 0 : this.slots.filter((s) => s.ready).length * PER_WORKER - this.inflight.size; }

  /** Queues a job; `flush()` sends what is queued. False when full. A key already on its way counts as taken. */
  submit(key: string, spec: SpriteSpec): boolean {
    if (this.inflight.has(key)) return true;
    if (this.capacity <= 0) return false;
    const id = ++this.seq;
    this.keys.set(id, key);
    this.inflight.add(key);
    this.staged.push({ job: { id, spec }, key });
    return true;
  }

  /** Sends the queued jobs to the least loaded workers in batches. */
  flush(): void {
    const ready = this.slots.filter((s) => s.ready);
    while (this.staged.length && ready.length) {
      const s = ready.reduce((a, b) => (b.load < a.load ? b : a));
      const batch = this.staged.splice(0, BATCH);
      s.load += batch.length;
      s.w.postMessage({ op: 'build', gen: this.gen, jobs: batch.map((b) => b.job) } satisfies ToSprite);
    }
  }

  /** Results of jobs sent before this call are dropped (fonts changed: their pixels are stale). */
  invalidate(): void {
    this.gen++;
    this.staged.length = 0;
    this.keys.clear();
    this.inflight.clear();
    this.slots.forEach((s) => { s.load = 0; });
  }

  private fail(reason: string): void {
    if (this.dead) return;
    this.dead = true;
    this.destroy();
    this.hooks.failed(reason);
  }

  destroy(): void {
    this.dead = true;
    this.slots.forEach((s) => s.w.terminate());
    this.slots.length = 0;
    this.staged.length = 0;
    this.inflight.clear();
    this.keys.clear();
  }
}
