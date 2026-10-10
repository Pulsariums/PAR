import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasLayer } from '../src/canvas/CanvasLayer';
import { filterPx, filterUserSpace, setFilterUserSpace } from '../src/canvas/filterSpace';
import type { Sprite } from '../src/canvas/raster';
import type { DrawItem } from '../src/canvas/types';
import { Overlay } from '../src/render/Overlay';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  setFilterUserSpace(false); // deterministic module state for the next test
});

describe('filterPx (ctx.filter radius vs the CTM)', () => {
  it('keeps the device sigma when the browser runs filter lengths in device space (devScale 1 and 2)', () => {
    expect(filterPx(3, 1, false)).toBe(3);
    expect(filterPx(8, 2, false)).toBe(8);
  });

  it('divides the device sigma by the CTM scale when the browser scales filter lengths (devScale 1 and 2)', () => {
    expect(filterPx(3, 1, true)).toBe(3);
    expect(filterPx(8, 2, true)).toBe(4);
    expect(filterPx(1.5 * 2, 2, true)).toBe(1.5);
  });

  it('rounds the radius to 4 decimals', () => {
    expect(filterPx(1 / 3, 1, false)).toBe(0.3333);
  });

  it('falls back to device space when the probe cannot run (no getImageData, no canvas)', () => {
    setFilterUserSpace(null);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never);
    expect(filterUserSpace()).toBe(false);
    setFilterUserSpace(null);
    vi.restoreAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never);
    expect(filterUserSpace()).toBe(false);
  });
});

interface Submission { matrix: [number, number, number, number, number, number]; args: unknown[] }

const makeContext = () => {
  type State = { matrix: [number, number, number, number, number, number]; alpha: number; filter: string };
  let state: State = { matrix: [1, 0, 0, 1, 0, 0], alpha: 1, filter: 'none' };
  const stack: State[] = [];
  const draws: Submission[] = [];
  const filterSets: string[] = [];
  const multiply = (a: number, b: number, c: number, d: number, e: number, f: number): void => {
    const [A, B, C, D, E, F] = state.matrix;
    state.matrix = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
  };
  const copy = (): State => ({ matrix: [...state.matrix], alpha: state.alpha, filter: state.filter });
  const ctx = {
    setTransform: (...m: [number, number, number, number, number, number]) => { state.matrix = m; },
    clearRect: () => undefined,
    save: () => { stack.push(copy()); },
    restore: () => { state = stack.pop()!; },
    translate: (x: number, y: number) => multiply(1, 0, 0, 1, x, y),
    rotate: (r: number) => multiply(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0),
    transform: multiply,
    beginPath: () => undefined,
    rect: () => undefined,
    clip: () => undefined,
    getImageData: undefined, // the probe must not find usable pixels in the fake
    isContextLost: () => lost,
    drawImage: (...args: unknown[]) => { draws.push({ matrix: [...state.matrix], args }); },
    get globalAlpha() { return state.alpha; },
    set globalAlpha(a: number) { state.alpha = a; },
    get filter() { return state.filter; },
    set filter(v: string) { state.filter = v; filterSets.push(v); },
  } as unknown as CanvasRenderingContext2D;
  let lost = false;
  return { ctx, draws, filterSets, setLost: (v: boolean) => { lost = v; } };
};

const item = (over: Partial<DrawItem> = {}): DrawItem => ({
  id: 'line', index: 0, layer: 0, key: 'sprite',
  spec: { text: 'x', family: 'Arial', weight: 400, italic: false, size: 10, ratio: 1, rx: 1, spacing: 0, kerning: true, plates: [], scale: 1 },
  alpha: 1, anchor: [10, 20], org: [10, 20], rot: 0, size: 10, ax: 0.5, ay: 0.5, shx: 0, shy: 0, clip: [], still: true, ...over,
});

const sprite = (over: Partial<Sprite> = {}): Sprite => ({ canvas: {}, w: 20, h: 15, boxW: 12, ox: -3, oy: -4, bytes: 1200, ...over } as Sprite);

const layerWith = (f: number): { layer: CanvasLayer; fake: ReturnType<typeof makeContext> } => {
  const fake = makeContext();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake.ctx);
  const layer = new CanvasLayer(new Overlay(document.body, 1));
  layer.resize({ width: 640, height: 360 }, f);
  return { layer, fake };
};

describe('CanvasLayer draw-time blur', () => {
  it('writes the device-space radius when the probe says filters run in device space', () => {
    setFilterUserSpace(false);
    const { layer, fake } = layerWith(2);
    // sigma 1.5 layout units, f = 2, size class exact (s = 1): 1.5 * 2 * 1 = 3 device px.
    layer.draw([{ layer: 0, index: 0, items: [{ ...item(), blur: 1.5, spec: { ...item().spec, animBlur: true, pad: 6 } }] }], [[sprite()]], Infinity);
    expect(fake.filterSets).toEqual(['blur(3px)', 'none']);
  });

  it('divides the radius by the CTM scale when the probe says filter lengths are user space', () => {
    setFilterUserSpace(true);
    const { layer, fake } = layerWith(2);
    // same 3-device-px target under a CTM of scale 2: the string carries 1.5, the transform multiplies it back to 3.
    layer.draw([{ layer: 0, index: 0, items: [{ ...item(), blur: 1.5, spec: { ...item().spec, animBlur: true, pad: 6 } }] }], [[sprite()]], Infinity);
    expect(fake.filterSets).toEqual(['blur(1.5px)', 'none']);
  });

  it('never touches ctx.filter for unblurred items (sigma 0 = the sharp path)', () => {
    setFilterUserSpace(true);
    const { layer, fake } = layerWith(2);
    layer.draw([{ layer: 0, index: 0, items: [item(), { ...item(), blur: undefined }] }], [[sprite(), sprite()]], Infinity);
    expect(fake.filterSets).toEqual([]);
    expect(fake.draws).toHaveLength(2);
  });

  it('compensates the ink-bounds padding exactly: the plate lands pad*CTM px earlier, its ink lands where the unpadded one does', () => {
    setFilterUserSpace(false);
    const { layer, fake } = layerWith(2);
    const pad = 6; // layout units
    const sharp = sprite(); // ox -3, w 20
    // f = 2: the pad grows the bitmap by pad * f device px on every side and moves ox by exactly -pad layout units.
    const padded = sprite({ w: 20 + 2 * pad * 2, ox: -3 - pad, oy: -4 - pad });
    const blurred = { ...item(), blur: 1.5, spec: { ...item().spec, animBlur: true, pad } };
    layer.draw([{ layer: 0, index: 0, items: [blurred] }], [[sharp]], Infinity);
    layer.draw([{ layer: 1, index: 1, items: [{ ...blurred, id: 'other', key: 'k2' }] }], [[padded]], Infinity);
    const [a, b] = fake.draws;
    // bitmap origins differ by exactly pad * f * s device px...
    expect(a.matrix[4] - b.matrix[4]).toBe(12); // pad 6 * f 2 * s 1
    expect(a.matrix[5] - b.matrix[5]).toBe(12);
    // ...and the padded bitmap starts pad * f px earlier, so the same ink pixel lands on the same device pixel
    // (one bitmap px = k * f = s stage/device px; the leading 1 px is the floor guard, identical in both).
    expect(b.matrix[4] + (1 + pad * 2)).toBe(a.matrix[4] + 1);
    expect(b.matrix[5] + (1 + pad * 2)).toBe(a.matrix[5] + 1);
  });
});

describe('composite skip after a 2D context loss', () => {
  it('repaints a frame it would otherwise skip while a slot context is lost', () => {
    const { layer, fake } = layerWith(1);
    const runs = [{ layer: 0, index: 0, items: [item()] }];
    const sp = sprite(); // the same cached bitmap object across the frames (identity is what the skip compares)
    layer.draw(runs, [[sp]], Infinity);
    expect(fake.draws).toHaveLength(1);
    layer.draw([{ ...runs[0], items: [{ ...item() }] }], [[sp]], Infinity); // identical: normally skipped
    expect(fake.draws).toHaveLength(1);
    fake.setLost(true);
    layer.draw([{ ...runs[0], items: [{ ...item() }] }], [[sp]], Infinity);
    expect(fake.draws).toHaveLength(2); // a lost canvas shows nothing: paint again
  });

  it('forgets the remembered frame when a lost context is restored (the browser gives back a blank canvas)', () => {
    const { layer, fake } = layerWith(1);
    const runs = [{ layer: 0, index: 0, items: [item()] }];
    const sp = sprite();
    layer.draw(runs, [[sp]], Infinity);
    fake.setLost(true);
    document.querySelector('canvas.par-canvas')!.dispatchEvent(new Event('contextrestored'));
    fake.setLost(false);
    layer.draw([{ ...runs[0], items: [{ ...item() }] }], [[sp]], Infinity);
    expect(fake.draws).toHaveLength(2); // restored blank canvas: the identical inputs must repaint
  });
});
