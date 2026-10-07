import { vi } from 'vitest';

import { attachSpriteHost, type HostDeps, type HostScope } from '../../src/canvas/workers/host';
import type { FromSprite, ToSprite } from '../../src/canvas/workers/protocol';
import type { SpriteSpec } from '../../src/canvas/types';

export const spec = (text: string, family = '"Arial", sans-serif', blur = 0): SpriteSpec => ({
  text, family, weight: 400, italic: false, size: 40, ratio: 1, rx: 1, spacing: 0, kerning: false, scale: 1,
  plates: blur ? [{ fill: 'rgb(1,2,3)', stroke: null, strokeW: 0, dx: 0, dy: 0, blur, carve: false, shadow: null }] : [],
});

export const bitmap = (): ImageBitmap => ({ close: vi.fn(), width: 4, height: 4 } as unknown as ImageBitmap);
export const wait = (ms = 20): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const hostDeps = (log: string[] = []): HostDeps => ({
  supported: () => true,
  blur: () => true,
  reset: () => { log.push('reset'); },
  build: (s) => { log.push(`build ${s.text}`); return { bitmap: bitmap(), w: 4, h: 4, boxW: 3, ox: 1, oy: 2, bytes: 64 }; },
  addFace: async (f) => { log.push(`face ${f.family}`); },
  removeFace: (k) => { log.push(`drop ${k}`); },
});

/** A Worker double running the sprite host on the next tick; `sent` records what the page posted. */
export const fakeWorker = (deps: HostDeps, sent: ToSprite[] = []): Worker & { fire(type: string, e?: object): void } => {
  const listeners = new Map<string, Array<(e: never) => void>>();
  let hostFn: (e: { data: ToSprite }) => void = () => undefined;
  const scope: HostScope = {
    postMessage: (m: FromSprite) => { setTimeout(() => (listeners.get('message') ?? []).forEach((l) => l({ data: m } as never)), 0); },
    addEventListener: (_t, fn) => { hostFn = fn; },
  };
  attachSpriteHost(scope, deps);
  return {
    postMessage: (m: ToSprite) => { sent.push(m); setTimeout(() => hostFn({ data: m }), 0); },
    addEventListener: (type: string, fn: (e: never) => void) => { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
    terminate: vi.fn(),
    fire: (type: string, e: object = {}) => (listeners.get(type) ?? []).forEach((l) => l(e as never)),
  } as unknown as Worker & { fire(type: string, e?: object): void };
};
