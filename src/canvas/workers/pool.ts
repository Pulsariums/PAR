import type { Sprite } from '../raster';
import type { SpriteSpec } from '../types';

import { FaceBook, type FaceInfo } from './faces';
import type { FaceData, FromSprite, Job, ToSprite } from './protocol';

export type { FaceInfo } from './faces';

/** Jobs one worker may hold at once (queued in its mailbox or running, stale ones included): enough to keep it busy between two messages, few enough to stay urgent. */
const PER_WORKER = 16;
const BATCH = 8;
/** A worker that holds jobs and has not answered for this long (ms of observed page time) is dead. */
const STALL_MS = 8000;
/** Face bytes per worker. */
const FACE_BUDGET = 64 << 20;

export interface PoolHooks {
  /** A sprite arrived. Only real sprites: whatever a worker could not build is left to the main thread. */
  built(key: string, s: Sprite): void;
  /** Room for more jobs (a message was processed). */
  free(): void;
  /** The pool is unusable (worker error, unsupported, stalled): the owner falls back to the main thread. */
  failed(reason: string): void;
}

interface Slot { w: Worker; load: number; sent: Set<string>; ready: boolean; blur: boolean; waited: number }
interface Out { key: string; spec: SpriteSpec }

/**
 * Builds sprites in Workers (OffscreenCanvas) and gets them back as ImageBitmaps. The main thread decides what to build and in which
 * order (the warm plan); the pool keeps its workers fed with a few jobs each and returns results through `hooks.built`. Anything it
 * cannot do identically (a font it does not carry, blur the worker cannot draw, a build that failed there) is refused or handed back
 * unbuilt: the main-thread path stays complete on its own and is the only judge of "this sprite cannot be built".
 */
export class SpritePool {
  private readonly slots: Slot[] = [];
  private readonly out = new Map<number, Out>();
  private readonly inflight = new Map<string, number>();
  private readonly refused = new Set<string>();
  private readonly staged: Job[] = [];
  private readonly book: FaceBook;
  private seq = 0;
  private gen = 0;
  private tick = 0;
  dead = false;
  /** Sprites received from workers, for the metrics. */
  received = 0;

  constructor(factory: () => Worker, size: number, private readonly hooks: PoolHooks, faceBudget = FACE_BUDGET) {
    this.book = new FaceBook(faceBudget);
    try {
      for (let i = 0; i < size; i++) this.slots.push(this.open(factory()));
    } catch (e) { this.fail(e instanceof Error ? e.message : String(e)); }
  }

  get size(): number { return this.slots.length; }
  get ready(): boolean { return !this.dead && this.slots.some((s) => s.ready); }
  /** Workers are starting (not ready yet, not failed). */
  get booting(): boolean { return !this.dead && !this.ready; }
  get pending(): number { return this.inflight.size; }
  /** Ms since this key was handed to the pool (null: not on its way). */
  age(key: string): number | null { const at = this.inflight.get(key); return at === undefined ? null : performance.now() - at; }

  private open(w: Worker): Slot {
    const slot: Slot = { w, load: 0, sent: new Set(), ready: false, blur: false, waited: 0 };
    w.addEventListener('message', (e: MessageEvent<FromSprite>) => this.onMessage(slot, e.data));
    w.addEventListener('error', (e) => this.fail(e.message || 'sprite worker error'));
    w.addEventListener('messageerror', () => this.fail('sprite worker message could not be read'));
    w.postMessage({ op: 'init' } satisfies ToSprite);
    return slot;
  }

  private onMessage(slot: Slot, m: FromSprite): void {
    if (this.dead) { if (m.op === 'built') m.items.forEach((i) => i.bitmap?.close()); return; }
    slot.waited = 0;
    if (m.op === 'ready') {
      if (!m.ok) { this.fail('OffscreenCanvas text is not supported in a worker'); return; }
      [slot.ready, slot.blur] = [true, m.blur];
      this.syncFaces(slot);
      this.hooks.free();
    } else if (m.op === 'faces') this.book.failed(m.failed);
    else this.onBuilt(slot, m);
  }

  private onBuilt(slot: Slot, m: Extract<FromSprite, { op: 'built' }>): void {
    slot.load = Math.max(0, slot.load - m.items.length);
    for (const it of m.items) {
      const o = this.out.get(it.id);
      this.out.delete(it.id);
      // Stale (fonts changed or a seek: `invalidate`), or the family has failed in the worker since the job was sent: never cache these pixels.
      if (!o || m.gen !== this.gen) { it.bitmap?.close(); continue; }
      this.inflight.delete(o.key);
      if (!this.book.allows(o.spec)) { it.bitmap?.close(); this.refused.add(o.key); continue; }
      if (!it.bitmap) { this.refused.add(o.key); continue; }
      this.received++;
      this.hooks.built(o.key, { canvas: it.bitmap, w: it.w, h: it.h, boxW: it.boxW, ox: it.ox, oy: it.oy, bytes: it.bytes });
    }
    this.hooks.free();
  }

  /** The faces the page has loaded (fonts changed): workers drop the old set and get the families the next sprites need. */
  setFaces(faces: FaceInfo[]): void {
    this.book.set(faces);
    this.slots.forEach((s) => { if (s.ready) this.syncFaces(s); });
  }

  private syncFaces(s: Slot): void {
    const want = this.book.wanted();
    const add: FaceData[] = [];
    for (const [k, f] of want) if (!s.sent.has(k)) { add.push({ key: k, family: f.family, weight: f.weight, italic: f.italic, data: f.data.slice().buffer as ArrayBuffer }); s.sent.add(k); }
    const remove = [...s.sent].filter((k) => !want.has(k));
    remove.forEach((k) => s.sent.delete(k));
    if (add.length || remove.length) this.post(s, { op: 'fonts', add, remove }, add.map((a) => a.data));
  }

  private post(s: Slot, m: ToSprite, transfer: Transferable[] = []): void {
    try { s.w.postMessage(m, transfer); } catch (e) { this.fail(e instanceof Error ? e.message : String(e)); }
  }

  /** Blurs need a worker that blurs for real; every family the page holds must be registered there. Registers the families the sprite needs. */
  accepts(spec: SpriteSpec, key: string): boolean {
    if (this.dead || this.refused.has(key)) return false;
    if (spec.plates.some((p) => p.blur > 0) && !this.slots.every((s) => !s.ready || s.blur)) return false;
    const r = this.book.take(spec);
    if (r.grew) this.slots.forEach((s) => { if (s.ready) this.syncFaces(s); });
    return r.ok;
  }

  /** Room for more jobs right now (stale jobs a worker still holds count: it cannot drop them). */
  get capacity(): number {
    return this.dead ? 0 : this.slots.reduce((n, s) => n + (s.ready ? PER_WORKER - s.load : 0), 0) - this.staged.length;
  }

  /** Queues a job; `flush()` sends what is queued. False when full. A key already on its way counts as taken. */
  submit(key: string, spec: SpriteSpec): boolean {
    if (this.inflight.has(key)) return true;
    if (this.capacity <= 0) return false;
    const id = ++this.seq;
    this.out.set(id, { key, spec });
    this.inflight.set(key, performance.now());
    this.staged.push({ id, spec });
    return true;
  }

  /** Sends the queued jobs to the least loaded workers in batches. */
  flush(): void {
    this.watch();
    const ready = this.slots.filter((s) => s.ready && s.load < PER_WORKER);
    while (this.staged.length && ready.length && !this.dead) {
      const s = ready.reduce((a, b) => (b.load < a.load ? b : a));
      const batch = this.staged.splice(0, Math.min(BATCH, PER_WORKER - s.load));
      s.load += batch.length;
      this.post(s, { op: 'build', gen: this.gen, jobs: batch }, []);
      if (s.load >= PER_WORKER) ready.splice(ready.indexOf(s), 1);
    }
  }

  /** Dead-worker watch: time is counted only while the page is running frames (a frozen tab must not look like a hung worker). */
  private watch(): void {
    const now = performance.now();
    const dt = this.tick && now - this.tick < 1000 ? now - this.tick : 0;
    this.tick = now;
    for (const s of this.slots) if (s.load > 0 && (s.waited += dt) > STALL_MS) { this.fail('sprite worker stopped answering'); return; }
  }

  /** Results of jobs sent before this call are dropped (fonts changed, or a seek moved the plan elsewhere). */
  invalidate(): void {
    this.gen++;
    this.staged.length = 0;
    this.out.clear();
    this.inflight.clear();
  }

  private fail(reason: string): void {
    if (this.dead) return;
    this.destroy();
    this.hooks.failed(reason);
  }

  destroy(): void {
    this.dead = true;
    this.slots.forEach((s) => s.w.terminate());
    this.slots.length = 0;
    this.staged.length = 0;
    this.inflight.clear();
    this.out.clear();
  }
}
