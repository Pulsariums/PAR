import type { FpsOption, PARRenderer } from '../../../src/index';
import { t } from '../i18n/i18n';

import { $ } from './dom';
import { RENDER_MARKS, VIDEO_MARKS, fpsChips } from './fpsMarks';

const SNAP = 2;

export interface LabFps {
  /** Frame rate of the video timeline (frame step and frame grid). */
  videoFps(): number;
  /** Re-writes the texts the language owns. */
  relabel(): void;
}

/** Render FPS (slider with snap marks, like the Options tab) and video FPS (chips + custom). Both go straight into PAR's options. */
export const initLabFps = (par: PARRenderer, customLabel: string, onVideoFps: () => void): LabFps => {
  const range = $<HTMLInputElement>('labFps');
  const auto = $<HTMLInputElement>('labFpsAuto');
  const out = $<HTMLOutputElement>('labFpsOut');
  let video = 24;

  const label = (): void => { out.textContent = auto.checked ? t('lab.auto') : `${range.value} fps`; };
  const render = (): void => {
    const fps: FpsOption = auto.checked ? 'auto' : Number(range.value);
    label();
    range.disabled = auto.checked;
    par.setOptions({ fps });
  };
  $('labFpsMarks').innerHTML = RENDER_MARKS.map((m) => `<option value="${m}"></option>`).join('');
  range.addEventListener('input', () => {
    const v = Number(range.value);
    const snap = RENDER_MARKS.find((m) => Math.abs(m - v) <= SNAP);
    if (snap !== undefined) range.value = String(snap);
    render();
  });
  auto.addEventListener('change', render);
  const renderChips = fpsChips(RENDER_MARKS, customLabel, (v) => { range.value = String(Math.min(200, Math.max(10, Math.round(v)))); auto.checked = false; render(); renderChips.set(Number(range.value)); }, null);
  $('labFpsChips').append(renderChips.root);
  const vchips = fpsChips(VIDEO_MARKS, customLabel, (v) => { video = v; vchips.set(v); par.setOptions({ videoFps: v }); onVideoFps(); }, video);
  $('labVideoFpsChips').append(vchips.root);
  par.setOptions({ videoFps: video });
  render();
  return { videoFps: () => video, relabel: label };
};
