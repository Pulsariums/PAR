import { frameRate, type PARMetrics } from '../../../src/index';
import { clock, humanBytes } from '../common/format';
import { t } from '../i18n/i18n';
import { $ } from '../player/dom';
import { FpsMeter, fpsText } from '../player/fpsMeter';
import type { Player } from '../player/player';

import { HeavyHint, renderRows, type MetricRow } from './metricRows';

const row = (k: string, v: string): string => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
const heap = (): string => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? humanBytes(m.usedJSHeapSize) : '—';
};

/**
 * The metrics panel under the player (collapsible): transport, windowed source, render path and measured FPS. The one-line summary is always
 * visible; the rows are only built while the panel is open. The "Heavy scene" hint shows whenever many lines are on screen.
 */
export const initStats = (player: Player, videoFps: () => number) => {
  const box = $<HTMLDetailsElement>('stMetrics');
  const dl = $<HTMLDListElement>('stStats');
  const sum = $('stMetricsSum');
  const heavyEl = $('stHeavy');
  const meter = new FpsMeter();
  const heavy = new HeavyHint();
  let openedAt = 0;
  let firstMs: number | null = null;
  let seekAt = 0;
  let seekTo = 0;
  let seekMs: number | null = null;
  let heavyShown = '';

  const covered = (time: number): boolean => {
    const r = player.par.getSourceStats().windowRange;
    return !!r && time >= r[0] && time < r[1];
  };
  const dash = '—';
  const ms = (v: number | null): string => (v === null ? dash : `${Math.round(v)} ms`);
  const label = (r: MetricRow): string => row(t(r.key), r.value);

  const draw = (): void => {
    const m = player.par.getMetrics();
    const fps = `${fpsText(meter.fps)} fps`;
    sum.textContent = `${fps} · ${t('st.m.linesN', { n: m.activeLines })}`;
    if (!box.open) return;
    const s = player.par.getSourceStats();
    const r = frameRate(videoFps());
    const time = player.transport.time;
    dl.innerHTML =
      row(t('st.m.time'), clock(time)) +
      row(t('st.m.frame'), String(Math.round((time * r.num) / r.den))) +
      row(t('m.lines'), String(m.activeLines)) +
      row(t('m.fps'), fpsText(meter.fps)) +
      renderRows(m.render).map(label).join('') +
      row(t('st.m.win'), `${t('st.m.events', { n: s.windowEvents })} (${s.loading ? t('st.m.loading') : t('st.m.idle')})`) +
      row(t('st.m.range'), s.windowRange ? `${s.windowRange[0].toFixed(1)} - ${s.windowRange[1].toFixed(1)} s` : dash) +
      row(t('st.m.read'), humanBytes(s.bytesRead)) +
      row(t('st.m.decode'), `${Math.round(s.decodeMs)} ms`) +
      row(t('st.m.heap'), heap()) +
      row(t('st.m.first'), ms(firstMs)) +
      row(t('st.m.seek'), ms(seekMs));
  };

  const hint = (lines: number, mode: 'auto' | 'dom' | 'canvas', now: number): void => {
    const state = heavy.update(lines, mode, now);
    const text = state === 'none' ? '' : t(state === 'dom' ? 'st.heavyDom' : 'st.heavy', { n: heavy.peak });
    if (text === heavyShown) return;
    heavyShown = text;
    heavyEl.textContent = text;
    heavyEl.hidden = !text;
  };

  box.addEventListener('toggle', draw);
  return {
    /** A subtitle is being opened: start timing the first frame. */
    opened(): void { openedAt = performance.now(); firstMs = null; seekMs = null; },
    seeked(time: number): void { seekTo = time; seekAt = performance.now(); seekMs = covered(time) ? 0 : null; if (seekMs === 0) seekAt = 0; draw(); },
    /** Every animation frame. */
    sample(m: PARMetrics): void {
      const now = performance.now();
      if (openedAt && firstMs === null && covered(player.transport.time)) firstMs = now - openedAt;
      if (seekAt && covered(seekTo)) { seekMs = now - seekAt; seekAt = 0; }
      hint(m.activeLines, m.render.mode, now);
      if (meter.sample(m.time, player.transport.playing, now)) draw();
    },
    draw,
  };
};
