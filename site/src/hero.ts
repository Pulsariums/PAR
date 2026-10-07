import { create } from '../../src/index';

import { ev, script } from './presets/ass';
import { CardTransport } from './player/transport';
import { drawCard } from './player/testcard';
import { onLang, t } from './i18n/i18n';

/** Hero: karaoke, a moving sign, a fade and a rotating shape, all rendered by PAR over the test card. */
const HERO_ASS = script(
  [
    ev(0, 10, '{\\k40}Pul{\\k40}sar {\\k50}A{\\k50}S{\\k50}S {\\k80}Ren{\\k80}der{\\k80}er', { style: 'Kara', mv: 70 }),
    ev(0, 10, '{\\fad(600,600)}Subtitles drawn by the browser', { style: 'Top', mv: 56 }),
    ev(1, 9, '{\\an5\\move(160,330,1120,330,500,5500)\\t(0,6000,\\frz360)\\1c&H00E5FF&\\bord4}\\move + \\t(\\frz)', { layer: 1 }),
    ev(3, 10, '{\\an5\\pos(640,230)\\clip(0,0,0,720)\\t(0,3000,\\clip(0,0,1280,720))\\blur1\\fs60}\\clip reveal'),
  ],
  0,
  'Hero',
);

export const initHero = (): void => {
  const stage = document.getElementById('heroStage') as HTMLElement;
  const canvas = document.getElementById('heroCard') as HTMLCanvasElement;
  const btn = document.getElementById('heroPlay') as HTMLButtonElement;
  const clock = new CardTransport();
  clock.duration = 10;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  clock.seek(reduce ? 4 : 0);
  if (!reduce) clock.play();
  create({ container: stage, clock: () => clock.time, subtitle: HERO_ASS, fps: 'auto' });

  const label = () => {
    btn.textContent = t(clock.playing ? 'ctl.pause' : 'ctl.play');
    btn.setAttribute('aria-pressed', String(clock.playing));
  };
  btn.addEventListener('click', () => { if (clock.playing) clock.pause(); else clock.play(); label(); });
  onLang(label);

  let last = NaN;
  const loop = () => {
    const w = Math.max(320, Math.min(1280, Math.round(canvas.clientWidth * (window.devicePixelRatio || 1))));
    if (canvas.width !== w) { canvas.width = w; canvas.height = Math.round((w * 9) / 16); last = NaN; }
    if (clock.time !== last) { drawCard(canvas, clock.time); last = clock.time; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};
