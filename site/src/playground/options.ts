import { t } from '../i18n/i18n';

import type { RegionMode, Store } from './store';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const MARKS = [12, 24, 30, 45, 60, 75, 120];
const SNAP = 2;

const num = (el: HTMLInputElement): number | null => {
  const v = el.value.trim();
  return v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
};

/** Wires the Options tab to the store (and the store back to the widgets' enabled/visible state). */
export const initOptions = (store: Store, hasVideo: () => boolean) => {
  const region = $<HTMLSelectElement>('region');
  const fit = $<HTMLSelectElement>('fit');
  const layout = $<HTMLSelectElement>('layout');
  const fps = $<HTMLInputElement>('fps');
  const fpsAuto = $<HTMLInputElement>('fpsAuto');
  const fpsOut = $<HTMLOutputElement>('fpsOut');
  const rect = (['rx', 'ry', 'rw', 'rh'] as const).map((id) => $<HTMLInputElement>(id));
  const lay = [$<HTMLInputElement>('lw'), $<HTMLInputElement>('lh')];
  const videoFps = $<HTMLInputElement>('videoFps');
  const offset = $<HTMLInputElement>('offset');
  const zIndex = $<HTMLInputElement>('zIndex');
  const note = $<HTMLParagraphElement>('optErr');

  $('fpsMarks').innerHTML = MARKS.map((m) => `<option value="${m}"></option>`).join('');
  $('fpsMarkBtns').innerHTML = MARKS.map((m) => `<button type="button" class="chip sm" data-fps="${m}">${m}</button>`).join('');
  $('fpsMarkBtns').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-fps]');
    if (b) { fps.value = b.dataset.fps!; store.patch({ fpsAuto: false, fps: Number(fps.value) }); }
  });

  region.addEventListener('change', () => store.patch({ region: region.value as RegionMode }));
  fit.addEventListener('change', () => store.patch({ fit: fit.value as 'contain' }));
  layout.addEventListener('change', () => store.patch({ layoutCustom: layout.value === 'custom' }));
  fpsAuto.addEventListener('change', () => store.patch({ fpsAuto: fpsAuto.checked }));
  fps.addEventListener('input', () => {
    const v = Number(fps.value);
    const snap = MARKS.find((m) => Math.abs(m - v) <= SNAP);
    if (snap !== undefined) fps.value = String(snap);
    store.patch({ fpsAuto: false, fps: Number(fps.value) });
  });
  const readRect = () => {
    const [x, y, width, height] = rect.map(num);
    if (x !== null && y !== null && width !== null && height !== null) store.patch({ rect: { x, y, width, height } });
  };
  rect.forEach((el) => el.addEventListener('input', readRect));
  const readLayout = () => {
    const [width, height] = lay.map(num);
    if (width !== null && height !== null) store.patch({ layout: { width, height } });
  };
  lay.forEach((el) => el.addEventListener('input', readLayout));
  videoFps.addEventListener('input', () => store.patch({ videoFps: videoFps.value }));
  offset.addEventListener('input', () => { const v = num(offset); if (v !== null) store.patch({ timeOffset: v }); });
  zIndex.addEventListener('input', () => { const v = num(zIndex); if (v !== null) store.patch({ zIndex: v }); });

  const sync = () => {
    const s = store.get();
    $('rectRow').hidden = s.region !== 'custom';
    lay.forEach((el) => { el.disabled = !s.layoutCustom; });
    fps.disabled = s.fpsAuto;
    fpsAuto.checked = s.fpsAuto;
    fpsOut.textContent = s.fpsAuto ? t('opt.auto') : `${s.fps} fps`;
    region.querySelector<HTMLOptionElement>('[value=video]')!.disabled = false;
    fit.disabled = !hasVideo();
  };
  store.subscribe(sync);
  sync();
  return {
    sync,
    error(msg: string): void {
      const s = store.get();
      note.textContent = msg || (s.region === 'video' && !hasVideo() ? t('opt.videoRegionNote') : '');
    },
  };
};
