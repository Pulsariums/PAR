import { describe, expect, it, vi } from 'vitest';

import { FaceBook } from '../src/canvas/workers/faces';
import { SpritePool, type PoolHooks } from '../src/canvas/workers/pool';
import { blurWorks } from '../src/canvas/workers/probe';
import type { ToSprite } from '../src/canvas/workers/protocol';
import { poolSize } from '../src/canvas/workers/size';

import { bitmap, fakeWorker, hostDeps, spec, wait } from './helpers/fakeWorker';

const face = (key: string, family: string, bytes = 8) => ({ key, family, weight: 400, italic: false, data: new Uint8Array(bytes) });
const hooks = (o: Partial<PoolHooks> = {}): PoolHooks => ({ built: () => undefined, free: () => undefined, failed: () => undefined, ...o });
const FAM = (...f: string[]): string => f.map((x) => `"${x}"`).join(', ') + ', sans-serif';

describe('faces: a sprite goes to a worker only when every font it may draw with is there', () => {
  it('refuses a font list whose LATER family is a face the workers do not carry (per-glyph fallback would differ)', () => {
    const b = new FaceBook(1 << 20);
    b.set([face('a', 'Latin'), face('b', 'HugeCJK', 30 << 20)]);
    expect(b.take(spec('x', FAM('Latin', 'HugeCJK'))).ok).toBe(false);
    expect(b.take(spec('x', FAM('Latin'))).ok).toBe(true);
    expect(b.allows(spec('x', FAM('HugeCJK')))).toBe(false);
  });
  it('ships faces by use, within the budget: a library of unused fonts is never sent', () => {
    const b = new FaceBook(100);
    b.set([face('a', 'A', 60), face('b', 'B', 60), face('c', 'C', 60)]);
    expect([...b.wanted().keys()]).toEqual([]);
    expect(b.take(spec('x', FAM('B'))).grew).toBe(true);
    expect([...b.wanted().keys()]).toEqual(['b']);
    expect(b.take(spec('x', FAM('A'))).ok).toBe(false); // 120 > 100: over budget, stays on the main thread
    expect([...b.wanted().keys()]).toEqual(['b']);
  });
  it('a face the worker failed to register takes its whole family out', () => {
    const b = new FaceBook(1 << 20);
    b.set([face('r', 'Foo'), face('b', 'Foo')]);
    expect(b.take(spec('x', FAM('Foo'))).ok).toBe(true);
    b.failed(['b']);
    expect(b.allows(spec('x', FAM('Foo')))).toBe(false);
    expect(b.wanted().size).toBe(0);
  });
  it('new faces (fonts changed) start over', () => {
    const b = new FaceBook(10);
    b.set([face('a', 'A', 50)]);
    expect(b.take(spec('x', FAM('A'))).ok).toBe(false);
    b.set([face('a2', 'A', 5)]);
    expect(b.take(spec('x', FAM('A'))).ok).toBe(true);
  });
});

describe('pool: failures never turn into "unbuildable", never leave a job pending', () => {
  it('a build the worker could not do is not cached as null: the main thread gets to decide', async () => {
    const d = hostDeps();
    d.build = (s) => { if (s.text === 'boom') throw new Error('oom'); return s.text === 'none' ? null : { bitmap: bitmap(), w: 1, h: 1, boxW: 1, ox: 0, oy: 0, bytes: 4 }; };
    const got: string[] = [];
    const pool = new SpritePool(() => fakeWorker(d), 1, hooks({ built: (k) => got.push(k) }));
    await wait();
    for (const t of ['ok', 'boom', 'none']) { expect(pool.accepts(spec(t), t)).toBe(true); pool.submit(t, spec(t)); }
    pool.flush();
    await wait();
    expect(got).toEqual(['ok']);
    expect(pool.pending).toBe(0);
    expect(pool.accepts(spec('boom'), 'boom')).toBe(false); // not sent again: the page builds it
    expect(pool.accepts(spec('boom'), 'other')).toBe(true);
  });

  it('a face the worker cannot register is reported, and sprites that need it are dropped and refused', async () => {
    const d = hostDeps();
    d.addFace = async () => { throw new Error('bad font'); };
    const got: string[] = [];
    const bm: ImageBitmap[] = [];
    d.build = () => { const b = bitmap(); bm.push(b); return { bitmap: b, w: 1, h: 1, boxW: 1, ox: 0, oy: 0, bytes: 4 }; };
    const pool = new SpritePool(() => fakeWorker(d), 1, hooks({ built: (k) => got.push(k) }));
    await wait();
    pool.setFaces([face('f', 'Fancy')]);
    expect(pool.accepts(spec('A', FAM('Fancy')), 'k')).toBe(true);
    pool.submit('k', spec('A', FAM('Fancy')));
    pool.flush();
    await wait();
    expect(got).toEqual([]);
    expect(bm[0].close).toHaveBeenCalled();
    expect(pool.accepts(spec('B', FAM('Fancy')), 'k2')).toBe(false);
    expect(pool.pending).toBe(0);
  });

  it('blurred sprites stay on the main thread when the worker cannot really blur', async () => {
    const d = hostDeps();
    d.blur = () => false;
    const pool = new SpritePool(() => fakeWorker(d), 1, hooks());
    await wait();
    expect(pool.ready).toBe(true);
    expect(pool.accepts(spec('A', FAM('Arial'), 2), 'a')).toBe(false);
    expect(pool.accepts(spec('A', FAM('Arial')), 'b')).toBe(true);
  });

  it('a seek or font change does not make the pool forget the jobs the workers still hold (no unbounded mailbox)', async () => {
    const pool = new SpritePool(() => fakeWorker(hostDeps()), 1, hooks());
    await wait();
    let n = 0;
    while (pool.submit(`a${n}`, spec('A'))) n++;
    pool.flush();
    pool.invalidate();
    expect(pool.capacity).toBe(0); // all 16 are still queued in the worker
    expect(pool.submit('fresh', spec('F'))).toBe(false);
    await wait();
    expect(pool.capacity).toBe(16);
  });

  it('results that arrive after destroy are closed, not delivered', async () => {
    const w = fakeWorker(hostDeps());
    const got: string[] = [];
    const pool = new SpritePool(() => w, 1, hooks({ built: (k) => got.push(k) }));
    await wait();
    pool.submit('k', spec('A'));
    pool.flush();
    const closed = bitmap();
    pool.destroy();
    w.fire('message', { data: { op: 'built', gen: 0, items: [{ id: 1, bitmap: closed, w: 1, h: 1, boxW: 1, ox: 0, oy: 0, bytes: 4 }] } });
    expect(got).toEqual([]);
    expect(closed.close).toHaveBeenCalled();
  });

  it('script error, unreadable message, failed postMessage and a worker that stops answering all fail the pool once', async () => {
    const cases: Array<(w: ReturnType<typeof fakeWorker>, pool: SpritePool) => void> = [
      (w) => w.fire('error', { message: 'csp' }),
      (w) => w.fire('messageerror'),
      (w, p) => { w.postMessage = () => { throw new Error('DataCloneError'); }; p.submit('k', spec('A')); p.flush(); },
    ];
    for (const trigger of cases) {
      const w = fakeWorker(hostDeps());
      const failed = vi.fn();
      const pool = new SpritePool(() => w, 1, hooks({ failed }));
      await wait();
      trigger(w, pool);
      expect(pool.dead).toBe(true);
      expect(failed).toHaveBeenCalledTimes(1);
      expect(w.terminate).toHaveBeenCalled();
    }
    const d = hostDeps();
    d.build = () => { throw new Error('unused'); };
    const sent: ToSprite[] = [];
    const w = fakeWorker(hostDeps(), sent);
    w.postMessage = () => undefined; // swallows jobs: never answers
    const failed = vi.fn();
    const pool = new SpritePool(() => w, 1, hooks({ failed }));
    w.fire('message', { data: { op: 'ready', ok: true, blur: true } });
    pool.submit('k', spec('A'));
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (now += 400));
    for (let i = 0; i < 30 && !pool.dead; i++) pool.flush();
    expect(failed).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('a frozen page (long gap between frames) is not mistaken for a stalled worker', async () => {
    const w = fakeWorker(hostDeps());
    w.postMessage = () => undefined;
    const pool = new SpritePool(() => w, 1, hooks());
    w.fire('message', { data: { op: 'ready', ok: true, blur: true } });
    pool.submit('k', spec('A'));
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (now += 60_000));
    for (let i = 0; i < 20; i++) pool.flush();
    expect(pool.dead).toBe(false);
    vi.restoreAllMocks();
  });
});

describe('host: fonts', () => {
  it('drops the shared masks whenever the font set changes and reports a face that did not load before any later build', async () => {
    const log: string[] = [];
    const d = hostDeps(log);
    d.addFace = async (f) => { if (f.key === 'bad') throw new Error('x'); log.push(`face ${f.key}`); };
    const sent: ToSprite[] = [];
    const msgs: unknown[] = [];
    const w = fakeWorker(d, sent);
    (w as unknown as { addEventListener: (t: string, f: (e: { data: unknown }) => void) => void }).addEventListener('message', (e) => msgs.push(e.data));
    w.postMessage({ op: 'fonts', add: [{ key: 'ok', family: 'A', weight: 400, italic: false, data: new ArrayBuffer(1) }, { key: 'bad', family: 'B', weight: 400, italic: false, data: new ArrayBuffer(1) }], remove: [] });
    w.postMessage({ op: 'build', gen: 0, jobs: [{ id: 1, spec: spec('A') }] });
    await wait();
    expect(log.indexOf('reset')).toBeLessThan(log.indexOf('build A'));
    expect(msgs.map((m) => (m as { op: string }).op)).toEqual(['faces', 'built']);
    expect(msgs[0]).toEqual({ op: 'faces', failed: ['bad'] });
  });
  it('a face dropped right after it was added is really dropped (drops run in message order, behind the loads)', async () => {
    const log: string[] = [];
    const d = hostDeps(log);
    d.addFace = async (f) => { await wait(5); log.push(`face ${f.key}`); };
    const w = fakeWorker(d);
    w.postMessage({ op: 'fonts', add: [{ key: 'k', family: 'A', weight: 400, italic: false, data: new ArrayBuffer(1) }], remove: [] });
    w.postMessage({ op: 'fonts', add: [], remove: ['k'] });
    await wait(40);
    expect(log.filter((l) => l !== 'reset')).toEqual(['face k', 'drop k']);
  });
});

describe('blur probe', () => {
  const canvas = (blurs: boolean) => (w: number, h: number) => {
    let filter = 'none';
    const c = { width: w, height: h, getContext: () => ({ fillStyle: '', fillRect: () => undefined, drawImage: () => undefined, getImageData: () => ({ data: [0, 0, 0, filter.startsWith('blur') && blurs ? 90 : 0] }), set filter(v: string) { filter = v; }, get filter() { return filter; } }) };
    return c as unknown as OffscreenCanvas;
  };
  it('is true only when the filter really spreads pixels', () => {
    expect(blurWorks(canvas(true))).toBe(true);
    expect(blurWorks(canvas(false))).toBe(false);
    expect(blurWorks(() => { throw new Error('no canvas'); })).toBe(false);
  });
});

describe('pool size on weak devices', () => {
  it('one core: none; little memory caps the pool', () => {
    expect(poolSize('auto', 1, true)).toBe(0);
    expect(poolSize('auto', 8, true, 2)).toBe(1);
    expect(poolSize('auto', 8, true, 4)).toBe(2);
    expect(poolSize('auto', 8, true, 8)).toBe(4);
    expect(poolSize('auto', 2, true, 1)).toBe(1);
    expect(poolSize('auto', undefined, true, undefined)).toBe(1);
  });
});
