import { t } from '../i18n/i18n';

import { FpsMeter } from './fpsMeter';
import type { Player } from './player';

const r = (n: number) => String(Math.round(n * 100) / 100);

/** Live metrics from getMetrics(). Measured FPS counts distinct subtitle times rendered per second. */
export const initMetrics = (player: Player) => {
  const dl = document.getElementById('metrics') as HTMLDListElement;
  const meter = new FpsMeter();

  const row = (k: string, v: string) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  const draw = () => {
    const m = player.par.getMetrics();
    dl.innerHTML =
      row(t('m.region'), `${r(m.region.x)},${r(m.region.y)} ${r(m.region.width)}x${r(m.region.height)}`) +
      row(t('m.layout'), `${m.layoutSize.width}x${m.layoutSize.height} (${m.layoutSource})`) +
      row(t('m.scale'), `${r(m.scaleX)} x ${r(m.scaleY)}`) +
      row(t('m.lines'), String(m.activeLines)) +
      row(t('m.fps'), String(meter.fps)) +
      row(t('m.time'), `${Number.isFinite(m.time) ? r(m.time) : '-'} s`);
  };
  return {
    /** Call every animation frame. */
    sample(): void {
      if (meter.sample(player.par.getMetrics().time)) draw();
    },
    draw,
  };
};
