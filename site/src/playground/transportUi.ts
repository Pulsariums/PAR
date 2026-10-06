import { t } from '../i18n/i18n';

import type { Player } from './player';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Play / pause, seek slider, time read-out and speed select. Polled from the shared rAF loop. */
export const initTransportUi = (player: Player) => {
  const play = $<HTMLButtonElement>('play');
  const seek = $<HTMLInputElement>('seek');
  const out = $<HTMLOutputElement>('timeOut');
  const speed = $<HTMLSelectElement>('speed');
  let dragging = false;

  const label = () => { play.textContent = t(player.transport.playing ? 'ctl.pause' : 'ctl.play'); };
  play.addEventListener('click', () => {
    const tr = player.transport;
    if (tr.playing) tr.pause(); else tr.play();
    label();
  });
  seek.addEventListener('input', () => { dragging = true; player.transport.seek(Number(seek.value)); });
  seek.addEventListener('change', () => { dragging = false; });
  speed.addEventListener('change', () => { player.card.setRate(Number(speed.value)); player.video.playbackRate = Number(speed.value); });

  return {
    label,
    update(): void {
      const tr = player.transport;
      const dur = tr.duration || 0;
      seek.max = String(dur || 10);
      if (!dragging) seek.value = String(tr.time);
      out.textContent = `${tr.time.toFixed(2)} / ${dur.toFixed(1)} s`;
      const want = t(tr.playing ? 'ctl.pause' : 'ctl.play');
      if (play.textContent !== want) play.textContent = want;
    },
  };
};
