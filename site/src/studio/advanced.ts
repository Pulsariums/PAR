import type { FpsOption, PARRenderer } from '../../../src/index';
import { t } from '../i18n/i18n';
import { $ } from '../player/dom';
import { RENDER_MARKS, VIDEO_MARKS } from '../player/fpsMarks';

import type { VideoFpsState } from './fpsState';

const opts = (values: readonly number[]): string => values.map((v) => `<option value="${v}">${v}</option>`).join('');

/** Markup of the Advanced row: render mode, render FPS, video FPS (frame step and frame grid) and the subtitle time offset. */
export const ADVANCED_HTML = `
<div class="row st-adv">
  <label class="fld"><span data-i18n="st.advMode"></span>
    <select id="stRenderMode"><option value="auto">auto</option><option value="canvas">canvas</option><option value="dom">dom</option></select></label>
  <label class="fld"><span data-i18n="st.advFps"></span>
    <select id="stRenderFps"><option value="auto" data-i18n="st.auto"></option>${opts(RENDER_MARKS)}</select></label>
  <label class="fld"><span data-i18n="st.advVideoFps"></span>
    <select id="stVideoFps"><option value=""></option>${opts(VIDEO_MARKS)}</select></label>
  <label class="fld"><span data-i18n="st.advOffset"></span>
    <input id="stOffset" type="number" step="0.1" value="0" inputmode="decimal" /></label>
</div>`;

/** Wires the Advanced row to PAR. `fps` is the video frame rate state: the select writes its pick, `sync` shows what the video measured. */
export const initAdvanced = (par: PARRenderer, fps: VideoFpsState, onVideoFps: () => void) => {
  const mode = $<HTMLSelectElement>('stRenderMode');
  const rate = $<HTMLSelectElement>('stRenderFps');
  const video = $<HTMLSelectElement>('stVideoFps');
  const offset = $<HTMLInputElement>('stOffset');

  mode.addEventListener('change', () => par.setOptions({ renderMode: mode.value as 'auto' | 'dom' | 'canvas' }));
  rate.addEventListener('change', () => par.setOptions({ fps: (rate.value === 'auto' ? 'auto' : Number(rate.value)) as FpsOption }));
  video.addEventListener('change', () => { fps.picked = video.value === '' ? null : Number(video.value); par.setOptions({ videoFps: fps.option }); onVideoFps(); });
  offset.addEventListener('change', () => { const v = Number(offset.value); par.setOptions({ timeOffset: Number.isFinite(v) ? v : 0 }); });

  /** The "auto" entry of the video FPS select names the measured rate; call after the video (or the language) changed. */
  const sync = (): void => {
    const first = video.options[0]!;
    first.textContent = fps.detected !== null ? t('st.autoVideo', { fps: fps.detected }) : t('st.autoUnknown');
    video.value = fps.picked === null ? '' : String(fps.picked);
  };
  sync();
  /** The choices as the generated code needs them. */
  const values = () => ({
    renderMode: mode.value as 'auto' | 'dom' | 'canvas',
    fps: (rate.value === 'auto' ? 'auto' : Number(rate.value)) as 'auto' | number,
    videoFps: fps.option,
    timeOffset: Number.isFinite(Number(offset.value)) ? Number(offset.value) : 0,
  });
  return { sync, values };
};
