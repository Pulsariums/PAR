import { MinHeap } from '../warm/heap';
import type { SpriteSpec } from '../types';

import type { FaceData, FromSprite, Built, ToSprite } from './protocol';

/** What the sprite host needs from its environment (the real worker wires the canvas raster; tests wire doubles). */
export interface HostDeps {
  supported(): boolean;
  /** `ctx.filter` blurs for real here (see `blurWorks`). */
  blur(): boolean;
  /** Builds a sprite and hands its bitmap over (or null). */
  build(spec: SpriteSpec): Omit<Built, 'id'> | null;
  addFace(f: FaceData): Promise<void>;
  removeFace(key: string): void;
  /** The font set changed: everything cached from the old fonts (white masks) is stale. */
  reset(): void;
}

export interface HostScope {
  postMessage(m: FromSprite, transfer?: Transferable[]): void;
  addEventListener(type: 'message', fn: (e: { data: ToSprite }) => void): void;
}

const NONE = { bitmap: null, w: 0, h: 0, boxW: 0, ox: 0, oy: 0, bytes: 0 };
/** Longest stretch (ms) the worker builds before it looks at its mailbox again (a seek's `drop` and urgent jobs are seen at most this late) and ships what it has. */
const SLICE_MS = 5;

interface Queued { id: number; spec: SpriteSpec; gen: number; prio: number }

/** Lets the event loop deliver pending messages before work goes on. */
const nextTask = (): Promise<void> => new Promise((r) => {
  if (typeof MessageChannel === 'undefined') { setTimeout(r, 0); return; }
  const ch = new MessageChannel();
  ch.port1.onmessage = () => { ch.port1.close(); r(); };
  ch.port2.postMessage(0);
});

/**
 * The sprite worker's message loop. Jobs join a priority queue of the worker's own and are built lowest priority first in short
 * slices, so the page can keep many jobs queued here (the worker never idles while the page is busy drawing) and still send a
 * sprite a frame is waiting for to the front. Font changes (drops, then loads) run in message order and every build waits for the ones
 * sent before it: a sprite rasterised before its font arrived would cache the fallback glyphs. A face that fails to register is
 * reported before any build that follows, so the pool can stop sending sprites that need it.
 */
export const attachSpriteHost = (scope: HostScope, deps: HostDeps): void => {
  let fonts: Promise<unknown> = Promise.resolve();
  const queue = new MinHeap<Queued>((q) => q.prio);
  let minGen = 0;
  let running = false;

  const buildOne = (j: Queued): Built => {
    try { return { id: j.id, ...(deps.build(j.spec) ?? NONE) }; } catch { return { id: j.id, ...NONE }; }
  };

  const drain = async (): Promise<void> => {
    running = true;
    while (queue.size > 0) {
      await fonts;
      const t0 = performance.now();
      const items: Built[] = [];
      let dropped = 0, gen = minGen;
      while (queue.size > 0 && performance.now() - t0 < SLICE_MS) {
        const j = queue.pop()!;
        if (j.gen < minGen) { dropped++; continue; }
        gen = j.gen;
        items.push(buildOne(j));
      }
      if (dropped) scope.postMessage({ op: 'dropped', gen: minGen, n: dropped });
      if (items.length) scope.postMessage({ op: 'built', gen, items }, items.flatMap((i) => (i.bitmap ? [i.bitmap] : [])));
      if (queue.size > 0) await nextTask();
    }
    running = false;
  };
  const kick = (): void => { if (!running && queue.size > 0) void drain(); };

  scope.addEventListener('message', ({ data: m }) => {
    if (m.op === 'init') scope.postMessage({ op: 'ready', ok: deps.supported(), blur: deps.supported() && deps.blur() });
    else if (m.op === 'fonts') {
      fonts = fonts.then(async () => {
        for (const k of m.remove) { try { deps.removeFace(k); } catch { /* the face stays registered: harmless */ } }
        const failed: string[] = [];
        await Promise.all(m.add.map((f) => deps.addFace(f).catch(() => { failed.push(f.key); })));
        deps.reset();
        if (failed.length) scope.postMessage({ op: 'faces', failed });
      });
    } else if (m.op === 'build') {
      for (const j of m.jobs) queue.push({ id: j.id, spec: j.spec, gen: m.gen, prio: j.prio });
      kick();
    } else if (m.op === 'drop') {
      minGen = Math.max(minGen, m.gen);
      kick();
    } else if (m.op === 'reprioritize') {
      queue.update((j) => j.id === m.id, (j) => { j.prio = m.prio; });
    }
  });
};
