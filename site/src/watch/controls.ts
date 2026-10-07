import { applyI18n, t } from '../i18n/i18n';
import { $ } from '../player/dom';

import { ICON } from './markup';
import { toggleFullscreen, onFullscreen } from './fullscreen';
import type { VideoLike } from './blank';
import type { WatchStage } from './stage';

const mmss = (s: number): string => {
  const v = Math.max(0, Math.floor(Number.isFinite(s) ? s : 0));
  const h = Math.floor(v / 3600);
  const m = String(Math.floor(v / 60) % 60).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${m}:${String(v % 60).padStart(2, '0')}`;
};

const IDLE_MS = 2800;

/** Play bar over the stage: play / pause, seek, time, volume, speed, subtitles on / off, fullscreen, keys. Controls hide while playing and nothing touches them. */
export const initControls = (stage: WatchStage): { update(): void } => {
  const box = stage.box;
  const m = (): VideoLike => stage.media;
  const seek = $<HTMLInputElement>('wSeek');
  const play = $<HTMLButtonElement>('wPlay');
  const vol = $<HTMLInputElement>('wVol');
  let dragging = false;
  let idle = 0;
  const wake = (): void => {
    box.classList.remove('idle');
    window.clearTimeout(idle);
    if (!m().paused) idle = window.setTimeout(() => { if (!m().paused && !box.contains(document.activeElement as Node | null)) box.classList.add('idle'); }, IDLE_MS);
  };
  const toggle = (): void => { if (m().paused) void Promise.resolve(m().play()).catch(() => undefined); else m().pause(); };
  const jump = (d: number): void => { m().currentTime = Math.min(Math.max(0, m().currentTime + d), Math.max(0, m().duration || 0)); wake(); };
  const paint = (): void => {
    play.innerHTML = m().paused ? ICON.play : ICON.pause;
    play.setAttribute('aria-label', t(m().paused ? 'w.play' : 'w.pause'));
    $('wMute').innerHTML = m().muted || m().volume === 0 ? ICON.muted : ICON.mute;
    wake();
  };
  const cc = $<HTMLButtonElement>('wCc');

  play.addEventListener('click', toggle);
  // A tap on the picture plays / pauses; with the controls hidden, the first tap only shows them (no accidental pause on phones).
  // Buttons repaint their icons while handling a click, so the target is detached by the time it bubbles: the bar and the empty card stop their own clicks here instead of being recognised later.
  ['wBar', 'wEmpty'].forEach((id) => ['click', 'dblclick'].forEach((e) => $(id).addEventListener(e, (ev) => ev.stopPropagation())));
  box.addEventListener('click', () => { if (box.classList.contains('idle')) wake(); else toggle(); });
  box.addEventListener('dblclick', () => void toggleFullscreen(box));
  [stage.video, stage.clock].forEach((src) => ['play', 'pause', 'ended', 'volumechange'].forEach((e) => src.addEventListener(e, paint)));
  ['pointermove', 'pointerdown', 'keydown', 'focusin'].forEach((e) => box.addEventListener(e, wake));
  seek.addEventListener('input', () => { dragging = true; m().currentTime = Number(seek.value); });
  seek.addEventListener('change', () => { dragging = false; });
  vol.addEventListener('input', () => { m().volume = Number(vol.value); m().muted = m().volume === 0; });
  $('wMute').addEventListener('click', () => { m().muted = !m().muted; });
  $<HTMLSelectElement>('wSpeed').addEventListener('change', (e) => { stage.video.playbackRate = stage.clock.playbackRate = Number((e.target as HTMLSelectElement).value); });
  cc.addEventListener('click', () => { const on = cc.getAttribute('aria-pressed') !== 'true'; cc.setAttribute('aria-pressed', String(on)); box.classList.toggle('nosub', !on); });
  $('wFull').addEventListener('click', () => void toggleFullscreen(box));
  onFullscreen(box, (on) => { $('wFull').innerHTML = on ? ICON.exit : ICON.full; });

  box.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof HTMLSelectElement)) return;
    const onRange = e.target instanceof HTMLInputElement && e.target.type === 'range';
    const k = e.key.toLowerCase();
    const act: Record<string, () => void> = {
      ' ': toggle, k: toggle, f: () => void toggleFullscreen(box), m: () => { m().muted = !m().muted; }, c: () => cc.click(),
      j: () => jump(-10), l: () => jump(10), home: () => { m().currentTime = 0; }, end: () => { m().currentTime = m().duration || 0; },
      ...(onRange ? {} : { arrowleft: () => jump(e.shiftKey ? -1 : -5), arrowright: () => jump(e.shiftKey ? 1 : 5) }),
    };
    if (e.target instanceof HTMLButtonElement && (k === ' ' || k === 'enter')) return;
    if (!act[k]) return;
    e.preventDefault();
    act[k]();
  });
  applyI18n(box);
  paint();

  return {
    update(): void {
      stage.clock.tick();
      const v = m();
      const d = Number.isFinite(v.duration) ? v.duration : 0;
      seek.max = String(d || 1);
      if (!dragging) seek.value = String(v.currentTime);
      seek.style.setProperty('--p', `${d ? (v.currentTime / d) * 100 : 0}%`);
      const label = `${mmss(v.currentTime)} / ${mmss(d)}`;
      const out = $('wTime');
      if (out.textContent !== label) out.textContent = label;
    },
  };
};
