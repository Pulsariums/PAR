import { applyI18n, t } from '../i18n/i18n';
import { watchDrop } from '../player/dnd';

import { DEFAULT_FPS, FPS_PRESETS, parseFps } from './plan';

export interface Controls {
  list: HTMLUListElement;
  live: HTMLElement;
  /** Frame rate for the next PAR conversion; null while the custom field holds something invalid. */
  fps(): number | null;
  verify(): { checked: boolean; touched: boolean };
}

const MARKUP = `
<div class="card cv">
  <div class="cv-top">
    <h2 id="cvTitle" data-i18n="cv.title">Quick converter</h2>
    <p class="muted cv-sub" data-i18n="cv.sub"></p>
  </div>
  <div class="cv-drop" id="cvDrop">
    <span data-i18n="cv.drop"></span>
    <button type="button" class="btn sm primary" id="cvPick" data-i18n="cv.pick">Choose files</button>
    <input type="file" id="cvFile" multiple hidden accept=".ass,.ssa,.xpar,.par" />
  </div>
  <div class="cv-opts">
    <label class="cv-opt"><span data-i18n="cv.fps"></span>
      <select id="cvFps">${FPS_PRESETS.map((f) => `<option value="${f}"${f === DEFAULT_FPS ? ' selected' : ''}>${f}</option>`).join('')}<option value="custom" data-i18n="cv.fpsCustom"></option></select>
    </label>
    <input type="text" id="cvFpsCustom" class="cv-custom" inputmode="decimal" autocomplete="off" hidden data-i18n-attr="aria-label:cv.fpsCustomLabel" />
    <label class="cv-opt"><input type="checkbox" id="cvVerify" checked /><span data-i18n="cv.verify"></span></label>
  </div>
  <p class="hint cv-hint" id="cvHint" data-i18n="cv.verifyHint"></p>
  <ul class="cv-list" id="cvList" aria-labelledby="cvTitle"></ul>
  <div class="sr-only" id="cvLive" role="status" aria-live="polite"></div>
</div>`;

/** Builds the card (drop zone, file picker, PAR fps, verify box) and wires them. `onFiles` gets every picked / dropped file. */
export const buildControls = (root: HTMLElement, onFiles: (files: File[]) => void): Controls => {
  root.innerHTML = MARKUP;
  const $ = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`)!;
  const input = $<HTMLInputElement>('cvFile');
  const select = $<HTMLSelectElement>('cvFps');
  const custom = $<HTMLInputElement>('cvFpsCustom');
  const verify = $<HTMLInputElement>('cvVerify');
  let touched = false;

  $('cvPick').addEventListener('click', () => input.click());
  input.addEventListener('change', () => { onFiles([...(input.files ?? [])]); input.value = ''; });
  verify.addEventListener('change', () => { touched = true; });
  const showCustom = (): void => {
    custom.hidden = select.value !== 'custom';
    if (!custom.hidden) custom.focus();
  };
  select.addEventListener('change', showCustom);
  custom.addEventListener('input', () => { custom.classList.toggle('bad', parseFps(custom.value) === null && custom.value !== ''); custom.title = custom.classList.contains('bad') ? t('cv.fpsBad') : ''; });

  watchDrop(root.querySelector<HTMLElement>('.cv')!, onFiles);
  applyI18n(root);

  return {
    list: $<HTMLUListElement>('cvList'), live: $('cvLive'),
    fps: () => (select.value === 'custom' ? parseFps(custom.value) : Number(select.value)),
    verify: () => ({ checked: verify.checked, touched }),
  };
};
