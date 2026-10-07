import { applyI18n, onLang } from '../i18n/i18n';
import { $ } from '../player/dom';
import { initMissingPrompt } from '../player/missingUi';

import { initControls } from './controls';
import { watchFps } from './fps';
import { initFiles } from './files';
import { initFonts } from './fonts';
import { WATCH_HTML } from './markup';
import { WatchStage } from './stage';

/** The player page: one video, one subtitle, the user's fonts. Nothing is measured and nothing is uploaded. */
export const initWatch = (root: HTMLElement): void => {
  root.innerHTML = WATCH_HTML;
  applyI18n(root);
  const stage = new WatchStage($('wStage'), $<HTMLVideoElement>('wVid'));
  const controls = initControls(stage);
  let files: ReturnType<typeof initFiles> | null = null;
  const fonts = initFonts(stage, (n) => files?.fontCount(n));
  files = initFiles(stage, fonts, root);
  watchFps(stage);
  initMissingPrompt(stage, () => $('wPickFonts').click(), $('wFontPrompt'));
  onLang(() => { files?.draw(); });
  files.draw();
  const loop = (): void => { controls.update(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
};
