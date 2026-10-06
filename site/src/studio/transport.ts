import { frameIndex, frameRate, type SubtitleSource } from '../../../src/index';
import { clock } from '../common/format';
import { t } from '../i18n/i18n';
import { $ } from '../playground/dom';
import type { Player } from '../playground/player';

import { nextStart, prevStart } from './neighbors';

const editable = (el: EventTarget | null): boolean => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName) && !(el instanceof HTMLInputElement && el.type === 'range'));

/** Timeline controls (ids `st*` of `transportMarkup`): play / pause, scrub, +-1 s / 5 s / 1 frame, previous / next line, speed, loop, keys. Polled from the Studio loop. */
export const initTransport = (player: Player, videoFps: () => number, onSeek: (t: number) => void, source: () => SubtitleSource | null) => {
  const p = 'st';
  const play = $<HTMLButtonElement>(`${p}Play`);
  const seek = $<HTMLInputElement>(`${p}Seek`);
  let dragging = false;
  const tr = () => player.transport;
  const dur = (): number => tr().duration || source()?.duration || 0;

  const go = (t0: number): void => {
    const t1 = Math.min(Math.max(0, t0), Math.max(0, dur() - 1e-3));
    tr().seek(t1);
    onSeek(t1);
  };
  const frame = (d: number): void => {
    const r = frameRate(videoFps());
    go(((frameIndex(tr().time, r) + d) * r.den) / r.num);
  };
  const line = async (dir: 1 | -1): Promise<void> => {
    const src = source();
    if (!src) return;
    const to = await (dir > 0 ? nextStart(src, tr().time) : prevStart(src, tr().time));
    if (to !== null) go(to);
  };
  const toggle = (): void => { if (tr().playing) tr().pause(); else { if (tr().time >= dur() - 1e-3) tr().seek(0); tr().play(); } label(); };
  const label = (): void => { play.textContent = t(tr().playing ? 'st.pause' : 'st.play'); };

  play.addEventListener('click', toggle);
  const step = (id: string, fn: () => void): void => $(`${p}${id}`).addEventListener('click', fn);
  step('Back5', () => go(tr().time - 5)); step('Back1', () => go(tr().time - 1)); step('BackF', () => frame(-1));
  step('FwdF', () => frame(1)); step('Fwd1', () => go(tr().time + 1)); step('Fwd5', () => go(tr().time + 5));
  step('PrevLine', () => void line(-1)); step('NextLine', () => void line(1));
  seek.addEventListener('input', () => { dragging = true; go(Number(seek.value)); });
  seek.addEventListener('change', () => { dragging = false; });
  $(`${p}Speed`).addEventListener('change', () => { const r = Number($<HTMLSelectElement>(`${p}Speed`).value); player.card.setRate(r); player.video.playbackRate = r; });
  $(`${p}Loop`).addEventListener('change', () => { const on = $<HTMLInputElement>(`${p}Loop`).checked; player.card.loop = on; player.video.loop = on; });

  $(p).addEventListener('keydown', (e: KeyboardEvent) => {
    if (editable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const onRange = e.target instanceof HTMLInputElement && e.target.type === 'range';
    const k = e.key.toLowerCase();
    const s = e.shiftKey ? 1 : 0;
    const act: Record<string, () => void> = {
      ' ': toggle, k: toggle, ',': () => frame(-1), '.': () => frame(1), j: () => go(tr().time - 5), l: () => go(tr().time + 5), '[': () => void line(-1), ']': () => void line(1),
      home: () => go(0), end: () => go(dur()),
      ...(onRange ? {} : { arrowleft: () => (s ? go(tr().time - 1) : frame(-1)), arrowright: () => (s ? go(tr().time + 1) : frame(1)) }),
    };
    if (!act[k]) return;
    e.preventDefault();
    act[k]();
  });

  return {
    label,
    update(): void {
      const d = dur();
      seek.max = String(d || 1);
      const now = tr().time;
      if (!dragging) seek.value = String(now);
      $(`${p}Cur`).textContent = clock(now);
      $(`${p}Total`).textContent = clock(d);
      const want = t(tr().playing ? 'st.pause' : 'st.play');
      if (play.textContent !== want) play.textContent = want;
    },
  };
};
