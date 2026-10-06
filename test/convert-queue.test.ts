import { describe, expect, it } from 'vitest';

import * as Q from '../site/src/convert/queue';

const done = { blob: new Blob(['x']), ms: 5, verified: 'none' as const };
const file = (name: string, size = 100) => ({ name, size });

describe('converter queue', () => {
  it('rejects unknown and empty files up front', () => {
    const q = Q.addItem(Q.addItem([], 1, file('a.txt'), 'unknown'), 2, file('b.ass', 0), 'unknown');
    expect(q.map((i) => i.status)).toEqual(['error', 'error']);
    expect(Q.enqueue(q, 1, 'xpar', 24, false)).toBe(q);
  });

  it('only queues actions the kind supports', () => {
    const q = Q.addItem([], 1, file('a.ass'), 'ass');
    expect(Q.enqueue(q, 1, 'ass', 24, false)).toBe(q);
    const q2 = Q.enqueue(q, 1, 'par', 29.97, false);
    expect(q2[0]).toMatchObject({ status: 'queued', action: 'par', fps: 29.97, outName: 'a.29.97fps.par' });
  });

  it('runs one file at a time, in order', () => {
    let q = Q.addItem(Q.addItem([], 1, file('a.ass'), 'ass'), 2, file('b.xpar'), 'xpar');
    q = Q.enqueue(Q.enqueue(q, 2, 'ass', 24, false), 1, 'xpar', 24, true);
    expect(Q.nextToRun(q)?.id).toBe(1);
    q = Q.start(q, 1);
    expect(Q.nextToRun(q)).toBeNull();
    expect(Q.isBusy(q)).toBe(true);
    q = Q.progress(q, 1, 0.5, 'verify');
    expect(q[0]).toMatchObject({ progress: 0.5, phase: 'verify' });
    q = Q.finish(q, 1, done);
    expect(q[0]).toMatchObject({ status: 'done', progress: 1 });
    expect(Q.nextToRun(q)?.id).toBe(2);
  });

  it('cancel returns to ready, fail keeps the message, a failed file can be retried', () => {
    let q = Q.enqueue(Q.addItem([], 1, file('a.ass'), 'ass'), 1, 'xpar', 24, false);
    q = Q.cancel(Q.start(q, 1), 1);
    expect(q[0]).toMatchObject({ status: 'ready', action: null });
    q = Q.fail(Q.enqueue(q, 1, 'xpar', 24, false), 1, 'boom');
    expect(q[0]).toMatchObject({ status: 'error', error: 'boom' });
    expect(Q.enqueue(q, 1, 'par', 24, false)[0].status).toBe('queued');
  });

  it('does not queue a file twice while it is queued or running; remove drops it', () => {
    let q = Q.enqueue(Q.addItem([], 1, file('a.ass'), 'ass'), 1, 'xpar', 24, false);
    expect(Q.enqueue(q, 1, 'par', 24, false)).toBe(q);
    q = Q.start(q, 1);
    expect(Q.enqueue(q, 1, 'par', 24, false)).toBe(q);
    expect(Q.remove(q, 1)).toEqual([]);
    expect(Q.isBusy(Q.remove(q, 1))).toBe(false);
  });
});
