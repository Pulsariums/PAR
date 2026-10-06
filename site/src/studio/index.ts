import { applyI18n, onLang } from '../i18n/i18n';
import { initDropAll } from '../playground/dnd';
import { $ } from '../playground/dom';
import { initLabTransport } from '../playground/labTransport';
import { initMissingPrompt } from '../playground/missingUi';
import { Player } from '../playground/player';
import type { LabSession } from '../playground/labTypes';

import { initExportPanel } from './exportPanel';
import { initFontShelf } from './fontShelf';
import { STUDIO_HTML } from './markup';
import { initShelfTabs } from './shelfTabs';
import { initSubShelf } from './subShelf';
import { initVideoShelf } from './videoShelf';

const SUB_FILE = /\.(ass|ssa|txt|xpar|par)$/i;

/** The Studio section: a real player (video + PAR overlay + transport) with a media shelf (videos, subtitles, fonts) and export of the selected subtitle. */
export const initStudio = (root: HTMLElement): void => {
  root.innerHTML = STUDIO_HTML;
  applyI18n(root);
  const status = (msg: string): void => { $('stStatus').textContent = msg; };
  const player = new Player($('stStage'), $<HTMLCanvasElement>('stCard'), $<HTMLVideoElement>('stVid'), '');
  let session: LabSession | null = null;
  let detected: number | null = null;
  const exporter = initExportPanel($('stExport'));
  const videoFps = (): number => detected ?? 24;
  const transport = initLabTransport(player, videoFps, () => undefined, () => session?.source ?? null, 'st');

  const fonts = initFontShelf($('stShelfFonts'), player, status);
  const subs = initSubShelf($('stShelfSubs'), player, {
    status,
    session: (s) => {
      session = s;
      exporter.setSession(s);
      fonts.setUsed(s ? [...s.source.script.styles.values()].map((x) => x.fontName) : []);
    },
  });
  const videos = initVideoShelf($('stShelfVideos'), player, (fps) => {
    detected = fps;
    player.par.setOptions({ videoFps: fps });
    exporter.setDetected(fps);
  });
  initMissingPrompt(player, fonts.pick, $('stFontPrompt'));
  const selectTab = initShelfTabs(root);
  initDropAll(root, (c) => {
    if (c.fonts.length) { selectTab('Fonts'); void fonts.add(c.fonts); }
    if (c.subs.length) { selectTab('Subs'); void subs.add(c.subs); }
    if (c.videos.length) { selectTab('Videos'); videos.addFiles(c.videos); }
  }, SUB_FILE);

  onLang(() => { videos.render(); subs.render(); fonts.render(); exporter.rebuild(); transport.label(); });
  [videos, subs, fonts].forEach((s) => s.render());
  const loop = (): void => { player.tick(); transport.update(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
};
