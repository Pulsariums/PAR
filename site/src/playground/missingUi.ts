import { createMissingFontsPrompt, type MissingPrompt, type PreflightReport } from '../../../src/index';
import { onLang, t } from '../i18n/i18n';

import { $ } from './dom';
import type { Player } from './player';

const KEY = 'par.askMissing';

export const askEnabled = (): boolean => {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
};
export const setAsk = (on: boolean): void => {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
};

const texts = () => ({
  title: t('lib.prompt.title'),
  message: t('lib.prompt.msg', { names: '{names}' }),
  continueLabel: t('lib.prompt.continue'),
  addLabel: t('lib.prompt.add'),
  glyphs: t('lib.prompt.glyphs', { names: '{names}' }),
  glyphsTitle: t('lib.prompt.glyphsTitle'),
});

/**
 * "Font X is missing. Continue anyway? [Continue] [Add font]" under the stage, driven by PAR's `missingfonts` event.
 * Shown when a script has missing fonts (or fonts that lack glyphs the script draws), hidden again when they arrive.
 * "Continue" keeps the fallback font for that set of names; the toggle in the library section turns the prompt off.
 */
export const initMissingPrompt = (player: Player, addFonts: () => void): void => {
  const host = $('fontPrompt');
  let prompt: MissingPrompt | null = null;
  let dismissed = '';
  let last: PreflightReport | null = null;
  const hide = (): void => { prompt?.destroy(); prompt = null; };
  const key = (r: PreflightReport): string => [...r.missing.map((m) => m.name), ...Object.keys(r.missingGlyphs)].join('\0');
  const show = (r: PreflightReport): void => {
    last = r;
    if (!askEnabled() || !key(r) || key(r) === dismissed) { hide(); return; }
    if (prompt) { prompt.update(r); return; }
    prompt = createMissingFontsPrompt(host, r, {
      texts: texts(),
      onContinue: () => { dismissed = key(last!); player.par.continueWithMissing(); hide(); },
      onDismiss: () => { dismissed = key(last!); hide(); },
      onAddFonts: addFonts,
    });
  };
  player.par.on('missingfonts', show);
  onLang(() => { if (prompt && last) { hide(); show(last); } });
};
