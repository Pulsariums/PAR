import { frameRate } from '../../../src/index';
import { t } from '../i18n/i18n';

import { $ } from './dom';
import { FpsMeter } from './fpsMeter';
import { clock, humanBytes } from './labFormat';
import type { Player } from './player';

const row = (k: string, v: string): string => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
const heap = (): string => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? humanBytes(m.usedJSHeapSize) : '-';
};

/** Live numbers under the player: time, frame, lines, window, bytes read, decode time, measured FPS, heap, first frame, last seek. */
export const initLabStats = (player: Player, videoFps: () => number) => {
  const dl = $<HTMLDListElement>('labStats');
  const meter = new FpsMeter();
  let openedAt = 0;
  let firstMs: number | null = null;
  let seekAt = 0;
  let seekTo = 0;
  let seekMs: number | null = null;

  const covered = (time: number): boolean => {
    const r = player.par.getSourceStats().windowRange;
    return !!r && time >= r[0] && time < r[1];
  };
  const draw = (): void => {
    const m = player.par.getMetrics();
    const s = player.par.getSourceStats();
    const r = frameRate(videoFps());
    const time = player.transport.time;
    dl.innerHTML =
      row(t('lab.st.time'), clock(time)) +
      row(t('lab.st.frame'), String(Math.round((time * r.num) / r.den))) +
      row(t('m.lines'), String(m.activeLines)) +
      row(t('lab.st.win'), `${t('lab.st.events', { n: s.windowEvents })} (${s.loading ? t('lab.st.loading') : t('lab.st.idle')})`) +
      row(t('lab.st.range'), s.windowRange ? `${s.windowRange[0].toFixed(1)} - ${s.windowRange[1].toFixed(1)} s` : '-') +
      row(t('lab.st.read'), humanBytes(s.bytesRead)) +
      row(t('lab.st.decode'), `${Math.round(s.decodeMs)} ms`) +
      row(t('m.fps'), String(meter.fps)) +
      row(t('lab.st.heap'), heap()) +
      row(t('lab.st.first'), firstMs === null ? '-' : `${Math.round(firstMs)} ms`) +
      row(t('lab.st.seek'), seekMs === null ? '-' : `${Math.round(seekMs)} ms`);
  };

  return {
    /** A file was opened: start timing the first frame. */
    opened(): void { openedAt = performance.now(); firstMs = null; seekMs = null; },
    seeked(time: number): void { seekTo = time; seekAt = performance.now(); seekMs = covered(time) ? 0 : null; if (seekMs === 0) seekAt = 0; },
    /** Every animation frame. */
    sample(): void {
      const now = performance.now();
      if (openedAt && firstMs === null && covered(player.transport.time)) firstMs = now - openedAt;
      if (seekAt && covered(seekTo)) { seekMs = now - seekAt; seekAt = 0; }
      if (meter.sample(player.par.getMetrics().time)) draw();
    },
    draw,
  };
};
