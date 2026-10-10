import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasLayer } from '../src/canvas/CanvasLayer';
import type { Baked } from '../src/canvas/bake';
import type { Sprite } from '../src/canvas/raster';
import { frameSignature } from '../src/canvas/key';
import type { DrawItem } from '../src/canvas/types';
import { Overlay } from '../src/render/Overlay';

const item = (alpha = 1): DrawItem => ({
  id: 'line', index: 0, layer: 0, key: 'sprite',
  spec: { text: 'x', family: 'Arial', weight: 400, italic: false, size: 10, ratio: 1, rx: 1, spacing: 0, kerning: true, plates: [], scale: 1 },
  alpha, anchor: [10, 20], org: [10, 20], rot: 0, size: 10, ax: 0.5, ay: 0.5, shx: 0, shy: 0, clip: [], still: true,
});

const sprite = { canvas: {}, w: 2, h: 3, boxW: 2, ox: 0, oy: 0, bytes: 24 } as never;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('canvas profiling', () => {
  it('counts composition operations only while profiling is enabled', () => {
    const ctx = {
      setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), transform: vi.fn(), drawImage: vi.fn(),
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    const layer = new CanvasLayer(new Overlay(document.body, 1));
    const runs = [{ layer: 0, index: 0, items: [item()] }];

    layer.setProfiling(true);
    layer.draw(runs, [[sprite]], Infinity);
    expect(layer.operationCounts()).toMatchObject({ drawImages: 1, drawOps: 2 });
    expect(layer.operationCounts().stateChanges).toBeGreaterThan(0);

    layer.setProfiling(false);
    layer.draw(runs, [[sprite]], Infinity);
    expect(layer.operationCounts()).toEqual({ drawImages: 0, drawOps: 0, stateChanges: 0 });
  });

  it('skips the clear+repaint when the composed frame is unchanged (subtitle frame held across display frames)', () => {
    const ctx = {
      setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), transform: vi.fn(), drawImage: vi.fn(),
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    const layer = new CanvasLayer(new Overlay(document.body, 1));
    layer.resize({ width: 640, height: 360 }, 1);
    const runs = [{ layer: 0, index: 0, items: [item(0.6)] }];
    layer.draw(runs, [[sprite]], Infinity);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    // Same values through fresh item objects (what planLine produces every frame) and the same cached sprite object: nothing changed.
    layer.draw([{ layer: 0, index: 0, items: [{ ...item(0.6) }] }], [[sprite]], Infinity);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    // A changed alpha repaints; a stage resize wipes the canvas, so the next frame paints again even with identical inputs.
    layer.draw([{ layer: 0, index: 0, items: [item(0.7)] }], [[sprite]], Infinity);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    layer.draw([{ layer: 0, index: 0, items: [item(0.7)] }], [[sprite]], Infinity);
    expect(ctx.clearRect).toHaveBeenCalledTimes(2);
    layer.resize({ width: 320, height: 180 }, 1);
    layer.draw([{ layer: 0, index: 0, items: [item(0.7)] }], [[sprite]], Infinity);
    expect(ctx.clearRect).toHaveBeenCalledTimes(3); // resize + the reopened slot's clear
    expect(ctx.drawImage).toHaveBeenCalledTimes(3);
  });

  it('avoids saved state for unclipped sprites but retains it for clips', () => {
    const ctx = {
      setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), transform: vi.fn(), drawImage: vi.fn(),
      beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    const layer = new CanvasLayer(new Overlay(document.body, 1));
    layer.resize({ width: 640, height: 360 }, 1);
    layer.setProfiling(true);
    layer.draw([{ layer: 0, index: 0, items: [item(0.3), item(0.7)] }], [[sprite, sprite]]);
    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.restore).not.toHaveBeenCalled();
    expect(layer.operationCounts()).toEqual({ drawImages: 2, drawOps: 3, stateChanges: 9 });

    const clipped = { ...item(), clip: [{ d: '', evenodd: false, rect: [0, 0, 30, 40] as [number, number, number, number] }] };
    layer.draw([{ layer: 0, index: 0, items: [clipped] }], [[sprite]]);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
    expect(ctx.clip).toHaveBeenCalledTimes(1);
    expect(layer.operationCounts()).toEqual({ drawImages: 1, drawOps: 2, stateChanges: 8 });
  });

  it('preserves transforms, alpha, clip isolation and draw order across mixed frames', () => {
    type Matrix = [number, number, number, number, number, number];
    type State = { matrix: Matrix; alpha: number; clips: unknown[] };
    type Submission = State & { args: unknown[] };
    const makeContext = () => {
      let state: State = { matrix: [1, 0, 0, 1, 0, 0], alpha: 1, clips: [] };
      const stack: State[] = [];
      const draws: Submission[] = [];
      const copy = (): State => ({ matrix: [...state.matrix], alpha: state.alpha, clips: [...state.clips] });
      const multiply = (a: number, b: number, c: number, d: number, e: number, f: number): void => {
        const [A, B, C, D, E, F] = state.matrix;
        state.matrix = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
      };
      let rect: number[] = [];
      const ctx = {
        setTransform: (...m: Matrix) => { state.matrix = m; },
        clearRect: () => undefined,
        save: () => { stack.push(copy()); },
        restore: () => { state = stack.pop()!; },
        translate: (x: number, y: number) => multiply(1, 0, 0, 1, x, y),
        rotate: (r: number) => multiply(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0),
        transform: multiply,
        beginPath: () => { rect = []; },
        rect: (...r: number[]) => { rect = r; },
        clip: (path?: unknown, rule?: unknown) => { state.clips.push(path ? [path, rule, [...state.matrix]] : [[...rect], [...state.matrix]]); },
        get globalAlpha() { return state.alpha; },
        set globalAlpha(alpha: number) { state.alpha = alpha; },
        drawImage: (...args: unknown[]) => { draws.push({ ...copy(), args }); },
      } as unknown as CanvasRenderingContext2D;
      return { ctx, draws, stack };
    };
    const optimized = makeContext();
    const reference = makeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(optimized.ctx);
    const layer = new CanvasLayer(new Overlay(document.body, 1));
    layer.resize({ width: 640, height: 360 }, 0.667);
    const sp = { canvas: {}, w: 31, h: 29, boxW: 17.5, ox: -4.25, oy: -5.75, bytes: 3596 } as Sprite;
    const baked = { canvas: {}, w: 23, h: 19, x: 9.25, y: -3.5, bytes: 1748 } as Baked;
    const clipped = { ...item(0.4), rot: 43, clip: [{ d: '', evenodd: false, rect: [-5, 2, 33, 44] as [number, number, number, number] }] };
    const frames: Array<{ items: DrawItem[]; sprites: Array<Sprite | Baked> }> = [
      { items: [{ ...item(0.2), anchor: [-12.5, 6.75], org: [55, 77], rot: -33, shx: 0.25, shy: -0.15, size: 17 }, clipped, item(0.8), item(0.5)], sprites: [sp, sp, baked, sp] },
      { items: [clipped, { ...item(1.5), rot: 72 }, item(-0.5)], sprites: [sp, sp, sp] },
    ];
    const baseline = (it: DrawItem, bitmap: Sprite | Baked): void => {
      const ctx = reference.ctx, f = 0.667;
      ctx.setTransform(f, 0, 0, f, 0, 0);
      if ('x' in bitmap) {
        ctx.globalAlpha = Math.min(1, Math.max(0, it.alpha));
        ctx.drawImage(bitmap.canvas as CanvasImageSource, 0, 0, bitmap.w, bitmap.h, bitmap.x, bitmap.y, bitmap.w / f, bitmap.h / f);
        return;
      }
      const s = it.size / it.spec.size;
      ctx.save();
      for (const c of it.clip) {
        ctx.beginPath();
        ctx.rect(c.rect![0], c.rect![1], c.rect![2] - c.rect![0], c.rect![3] - c.rect![1]);
        ctx.clip();
      }
      ctx.translate(it.org[0], it.org[1]);
      ctx.rotate(it.rot * (Math.PI / 180));
      ctx.translate(-it.org[0], -it.org[1]);
      ctx.translate(it.anchor[0] - it.ax * bitmap.boxW * s, it.anchor[1] - it.ay * it.size);
      if (it.shx !== 0 || it.shy !== 0) ctx.transform(1, it.shy, it.shx, 1, 0, 0);
      ctx.translate(bitmap.ox * s, bitmap.oy * s);
      ctx.globalAlpha = Math.min(1, Math.max(0, it.alpha));
      const k = s / it.spec.scale;
      ctx.drawImage(bitmap.canvas as CanvasImageSource, 0, 0, bitmap.w, bitmap.h, 0, 0, bitmap.w * k, bitmap.h * k);
      ctx.restore();
    };
    for (const frame of frames) {
      layer.draw([{ layer: 0, index: 0, items: frame.items }], [frame.sprites]);
      frame.items.forEach((it, i) => baseline(it, frame.sprites[i]));
    }
    expect(optimized.draws).toEqual(reference.draws);
    expect(optimized.stack).toHaveLength(0);
    expect(reference.stack).toHaveLength(0);
    expect(optimized.draws.map((draw) => draw.clips.length)).toEqual([0, 1, 0, 0, 1, 0, 0]);
  });

  it('produces a bounded stable signature for effective frame inputs', () => {
    const runs = [{ layer: 0, index: 0, items: [item()] }];
    const first = frameSignature(runs, [[sprite]]);
    expect(first).toMatch(/^[0-9a-f]{8}$/);
    expect(frameSignature(runs, [[sprite]])).toBe(first);
    expect(frameSignature([{ ...runs[0], items: [item(0.5)] }], [[sprite]])).not.toBe(first);
  });
});
