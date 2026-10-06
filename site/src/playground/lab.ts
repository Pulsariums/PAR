import { applyI18n, onLang, t } from '../i18n/i18n';
import { presetById } from '../presets';

import { initDrop } from './dnd';
import { $ } from './dom';
import { initLabFps } from './labFps';
import { initLabLayout } from './labLayout';
import { initLabLoad } from './labLoad';
import { LAB_HTML } from './labMarkup';
import { initLabSize } from './labSize';
import { SizeClient } from './labSizeClient';
import { initLabStats } from './labStats';
import { initLabTransport } from './labTransport';
import type { LabSession } from './labTypes';
import { initMissingPrompt } from './missingUi';
import { Player } from './player';

const SUB_FILE = /\.(ass|ssa|txt|xpar|par)$/i;

/** The Lab section: open a big ASS / XPAR / PAR, see its sizes, play it on a timeline, compare virtual and real layout. */
export const initLab = (root: HTMLElement): void => {
  root.innerHTML = LAB_HTML;
  applyI18n(root);
  const player = new Player($('labStage'), $<HTMLCanvasElement>('labCard'), $<HTMLVideoElement>('labVid'), presetById('boundary')!.ass);
  const client = new SizeClient();
  let session: LabSession | null = null;
  let videoUrl = '';

  const layout = initLabLayout(player.par, () => size.playRes());
  const size = initLabSize($('labSizePanel'), client, layout.defaultSize);
  const fps = initLabFps(player.par, t('lab.s.custom'), () => stats.draw());
  const stats = initLabStats(player, fps.videoFps);
  const transport = initLabTransport(player, fps.videoFps, (to) => stats.seeked(to), () => session?.source ?? null);
  const load = initLabLoad(client, {
    begin: () => { player.card.pause(); stats.opened(); },
    ready: (s) => {
      session = s;
      player.setSource(s.source);
      player.card.seek(0);
      size.setSession(s);
      transport.label();
    },
  });

  const fontPicker = $<HTMLInputElement>('labFontFiles');
  const addFonts = (files: File[]): void => {
    void import('./libShared').then(async (m) => {
      const res = await (await m.getLibrary()).add(files);
      $('labStatus').textContent = t('lab.fontsAdded', { n: res.added.length });
    });
  };
  $('labFontsBtn').addEventListener('click', () => fontPicker.click());
  fontPicker.addEventListener('change', () => { const f = Array.from(fontPicker.files ?? []); fontPicker.value = ''; if (f.length) addFonts(f); });
  initMissingPrompt(player, () => fontPicker.click(), $('labFontPrompt'));
  void import('./libShared').then(async (m) => player.par.setOptions({ fontProviders: [(await m.getLibrary()).asProvider()] })).catch(() => undefined);

  const useVideo = (f: File): void => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(f);
    player.useVideo(videoUrl);
    player.par.setOptions({ region: 'video' });
    $('labVideoBtn').textContent = t('lab.videoOff');
  };
  $('labVideoBtn').addEventListener('click', () => {
    if (!player.hasVideo) { $<HTMLInputElement>('labVideoFile').click(); return; }
    player.useCard();
    player.par.setOptions({ region: 'container' });
    $('labVideoBtn').textContent = t('lab.video');
  });
  $<HTMLInputElement>('labVideoFile').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) useVideo(f);
  });
  initDrop(root, useVideo, (f) => void load.open(f, f.name), addFonts, SUB_FILE);

  onLang(() => { fps.relabel(); size.rebuild(); stats.draw(); layout.draw(player.par.getMetrics()); transport.label(); $('labVideoBtn').textContent = t(player.hasVideo ? 'lab.videoOff' : 'lab.video'); });
  stats.draw();

  const loop = (): void => {
    player.tick();
    transport.update();
    stats.sample();
    layout.draw(player.par.getMetrics());
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};
