import { defaultLayoutSize, type DefaultLayoutOption, type LayoutOption, type PARMetrics, type PARRenderer } from '../../../src/index';
import { t } from '../i18n/i18n';

import { $, el } from './dom';

const num = (id: string): number => Number($<HTMLInputElement>(id).value);
const round = (n: number): string => String(Math.round(n * 1000) / 1000);

/** Virtual and real size: current numbers, the default-size and override selectors, and the overlay that draws the virtual grid. */
export const initLabLayout = (par: PARRenderer, onChange: () => void) => {
  const kv = $<HTMLDListElement>('labLayKv');
  const frame = $('labFrame');
  const tag = $('labFrameTag');
  let def: 'custom' | '720p' | 'libass' = '720p';
  let override = false;

  const defaultOption = (): DefaultLayoutOption => (def === 'custom' ? { width: Math.max(1, num('labDefW')), height: Math.max(1, num('labDefH')) } : def);
  const apply = (): void => {
    const layout: LayoutOption = override ? { width: Math.max(1, num('labOvW')), height: Math.max(1, num('labOvH')) } : 'script';
    par.setOptions({ defaultLayout: defaultOption(), layout });
    $('labDefaultRow').hidden = def !== 'custom';
    $('labOverrideRow').hidden = !override;
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
  group('labDefault', 'data-def', (v) => { def = v as typeof def; });
  group('labOverride', 'data-ov', (v) => { override = v === 'custom'; });
  for (const id of ['labDefW', 'labDefH', 'labOvW', 'labOvH']) $(id).addEventListener('input', apply);
  $<HTMLInputElement>('labOverlay').addEventListener('change', () => { frame.hidden = !$<HTMLInputElement>('labOverlay').checked; });

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

  const draw = (m: PARMetrics): void => {
    const src = t(`lab.l.src.${m.layoutSource}` as 'lab.l.src.script');
    kv.replaceChildren(
      row(t('lab.l.virtual'), `${m.layoutSize.width} x ${m.layoutSize.height}`, `${src}${m.layoutDerived ? `, ${t('lab.l.derived')}` : ''}`),
      row(t('lab.l.real'), `${round(m.regionSize.width)} x ${round(m.regionSize.height)} px`),
      row(t('lab.l.scale'), `x${round(m.scale.x)} / x${round(m.scale.y)}`),
    );
    if (frame.hidden) return;
    const s = m.scale.x > 0 ? step(m.scale.x) : 100;
    Object.assign(frame.style, { left: `${m.region.x}px`, top: `${m.region.y}px`, width: `${m.region.width}px`, height: `${m.region.height}px`, backgroundSize: `${s * m.scale.x}px ${s * m.scale.y}px` });
    tag.textContent = t('lab.l.ovLabel', { v: `${m.layoutSize.width}x${m.layoutSize.height}`, r: `${round(m.regionSize.width)}x${round(m.regionSize.height)}`, s: round(m.scale.x) }) + `  (grid ${s})`;
  };

  return { draw, defaultSize: () => defaultLayoutSize(defaultOption()) };
};
