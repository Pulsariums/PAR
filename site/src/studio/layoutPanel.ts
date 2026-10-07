import { defaultLayoutSize, type DefaultLayoutOption, type LayoutOption, type PARMetrics, type PARRenderer } from '../../../src/index';
import { t } from '../i18n/i18n';

import { $, el } from '../player/dom';

const num = (id: string): number => Number($<HTMLInputElement>(id).value);
const round = (n: number): string => String(Math.round(n * 1000) / 1000);

/** Virtual and real size: current numbers, the default-size and override selectors, and the overlay that draws the virtual grid. */
export const initLayoutPanel = (par: PARRenderer, onChange: () => void) => {
  const box = $<HTMLDetailsElement>('stLayout');
  const sum = $('stLaySum');
  const kv = $<HTMLDListElement>('stLayKv');
  const frame = $('stFrame');
  const tag = $('stFrameTag');
  let def: 'custom' | '1080p' | '720p' | 'libass' = '1080p';
  let override = false;

  const defaultOption = (): DefaultLayoutOption => (def === 'custom' ? { width: Math.max(1, num('stLayDefW')), height: Math.max(1, num('stLayDefH')) } : def);
  const apply = (): void => {
    const layout: LayoutOption = override ? { width: Math.max(1, num('stLayOvW')), height: Math.max(1, num('stLayOvH')) } : 'script';
    par.setOptions({ defaultLayout: defaultOption(), layout });
    $('stLayDefRow').hidden = def !== 'custom';
    $('stLayOvRow').hidden = !override;
    onChange();
  };
  const group = (id: string, attr: string, pick: (v: string) => void): void => {
    $(id).addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>(`[${attr}]`);
      if (!b) return;
      $(id).querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      pick(b.getAttribute(attr)!);
      apply();
    });
  };
  group('stLayDef', 'data-def', (v) => { def = v as typeof def; });
  group('stLayOv', 'data-ov', (v) => { override = v === 'custom'; });
  for (const id of ['stLayDefW', 'stLayDefH', 'stLayOvW', 'stLayOvH']) $(id).addEventListener('input', apply);
  $<HTMLInputElement>('stLayOverlay').addEventListener('change', () => { frame.hidden = !$<HTMLInputElement>('stLayOverlay').checked; });

  const row = (k: string, v: string, chip = ''): HTMLElement => {
    const d = el('div');
    const dd = el('dd', '', v);
    if (chip) dd.append(' ', el('span', 'status approx', chip));
    d.append(el('dt', '', k), dd);
    return d;
  };

  /** Grid step in virtual units: the first of 1/2/5 x 10^n whose on-screen size is at least 40 px. */
  const step = (scale: number): number => {
    for (let e = 0; e < 6; e++) for (const m of [1, 2, 5]) if (m * 10 ** e * scale >= 40) return m * 10 ** e;
    return 100000;
  };

  let last = '';
  const fill = (m: PARMetrics): void => {
    const src = t(`st.l.src.${m.layoutSource}` as 'st.l.src.script');
    kv.replaceChildren(
      row(t('st.l.virtual'), `${m.layoutSize.width} x ${m.layoutSize.height}`, `${src}${m.layoutDerived ? `, ${t('st.l.derived')}` : ''}`),
      row(t('st.l.real'), `${round(m.regionSize.width)} x ${round(m.regionSize.height)} px`),
      row(t('st.l.scale'), `x${round(m.scale.x)} / x${round(m.scale.y)}`),
    );
  };
  box.addEventListener('toggle', () => { last = ''; });
  const draw = (m: PARMetrics): void => {
    const key = `${m.layoutSize.width}x${m.layoutSize.height} ${m.layoutSource} ${m.layoutDerived} ${round(m.regionSize.width)}x${round(m.regionSize.height)} ${round(m.scale.x)}`;
    if (key !== last) {
      last = key;
      sum.textContent = `${m.layoutSize.width}x${m.layoutSize.height} \u2192 ${round(m.regionSize.width)}x${round(m.regionSize.height)} px (x${round(m.scale.x)})`;
      if (box.open) fill(m);
    }
    if (frame.hidden) return;
    const s = m.scale.x > 0 ? step(m.scale.x) : 100;
    Object.assign(frame.style, { left: `${m.region.x}px`, top: `${m.region.y}px`, width: `${m.region.width}px`, height: `${m.region.height}px`, backgroundSize: `${s * m.scale.x}px ${s * m.scale.y}px` });
    tag.textContent = t('st.l.ovLabel', { v: `${m.layoutSize.width}x${m.layoutSize.height}`, r: `${round(m.regionSize.width)}x${round(m.regionSize.height)}`, s: round(m.scale.x) }) + `  (grid ${s})`;
  };

  return { draw, relabel: (): void => { last = ''; }, defaultSize: () => defaultLayoutSize(defaultOption()) };
};
