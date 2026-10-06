import { sniffBlob } from '../../../src/source';
import { onLang, t } from '../i18n/i18n';

import { buildControls, type Controls } from './controls';
import { shouldVerify, type Action } from './plan';
import * as Q from './queue';
import { runConvert, type Run } from './runner';
import { Row } from './row';

/** Quick converter card: pick or drop files, choose a conversion per file, files run one after another in a Worker each. */
export const initConvert = (root: HTMLElement): void => {
  let q: Q.Queue = [];
  let seq = 0;
  let current: { id: number; run: Run } | null = null;
  const rows = new Map<number, Row>();
  const ctl: Controls = buildControls(root, (files) => void add(files));

  const sync = (): void => {
    for (const it of q) rows.get(it.id)?.update(it);
    for (const [id, row] of rows) if (!q.some((i) => i.id === id)) { row.root.remove(); rows.delete(id); }
    pump();
  };
  const set = (next: Q.Queue): void => { q = next; sync(); };

  const pump = (): void => {
    const it = Q.nextToRun(q);
    if (!it || current || !it.action) return;
    const file = files.get(it.id)!;
    q = Q.start(q, it.id);
    rows.get(it.id)?.update(q.find((i) => i.id === it.id)!);
    const run = runConvert({ blob: file, kind: it.kind, action: it.action, fps: it.fps, verify: it.verify }, (f, phase) => {
      if (current?.id !== it.id) return;
      q = Q.progress(q, it.id, f, phase);
      rows.get(it.id)?.update(q.find((i) => i.id === it.id)!);
    });
    current = { id: it.id, run };
    run.promise.then(
      (r) => { if (current?.id === it.id) { current = null; ctl.live.textContent = t('cv.live.done', { name: it.name }); set(Q.finish(q, it.id, r)); } },
      (e: unknown) => { if (current?.id === it.id) { current = null; ctl.live.textContent = t('cv.live.fail', { name: it.name }); set(Q.fail(q, it.id, t('cv.err.fail', { error: e instanceof Error ? e.message : String(e) }))); } },
    );
  };

  const files = new Map<number, File>();
  const add = async (picked: File[]): Promise<void> => {
    for (const f of picked) {
      const id = ++seq;
      let kind: Awaited<ReturnType<typeof sniffBlob>> = 'unknown';
      let error = '';
      try { kind = await sniffBlob(f); } catch (e) { error = t('cv.err.read', { error: e instanceof Error ? e.message : String(e) }); }
      files.set(id, f);
      q = Q.addItem(q, id, f, kind, error);
      const row = new Row(id, { run: onRun, cancel: onCancel, remove: onRemove });
      rows.set(id, row);
      ctl.list.append(row.root);
    }
    sync();
  };

  const onRun = (id: number, action: Action): void => {
    const it = q.find((i) => i.id === id);
    if (!it) return;
    const fps = ctl.fps();
    if (action === 'par' && fps === null) { ctl.live.textContent = t('cv.fpsBad'); return; }
    const v = ctl.verify();
    set(Q.enqueue(q, id, action, fps ?? 24, shouldVerify(action, v.checked, v.touched, it.size)));
  };
  const stop = (id: number): void => { if (current?.id === id) { current.run.cancel(); current = null; } };
  const onCancel = (id: number): void => { stop(id); set(Q.cancel(q, id)); };
  const onRemove = (id: number): void => { stop(id); files.delete(id); set(Q.remove(q, id)); };

  onLang(() => sync());
};
