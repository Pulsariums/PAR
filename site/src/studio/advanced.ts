import type { FpsOption, PARRenderer } from '../../../src/index';
import { t } from '../i18n/i18n';
import { $ } from '../player/dom';
import { RENDER_MARKS, VIDEO_MARKS } from '../player/fpsMarks';

import type { VideoFpsState } from './fpsState';

const opts = (values: readonly number[]): string => values.map((v) => `<option value="${v}">${v}</option>`).join('');
/** How far ahead live preparation may look, in subtitle seconds. */
export const WARM_RANGE_MARKS = [10, 30, 60, 120, 300] as const;
/** Preparation policy for the first play and a live seek. */
export type PrepareMode = 'source' | 'dense' | 'off';
const PREPARE_LABELS: Record<PrepareMode, 'st.advPrepareFull' | 'st.advPrepareDense' | 'st.advPrepareOff'> = {
  source: 'st.advPrepareFull', dense: 'st.advPrepareDense', off: 'st.advPrepareOff',
};
const readMode = (v: string): PrepareMode => v === 'dense' || v === 'off' ? v : 'source';

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
  <label class="fld"><span data-i18n="st.advWarmRange"></span>
    <select id="stWarmRange">${WARM_RANGE_MARKS.map((v) => `<option value="${v}"${v === 30 ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
  <label class="fld"><span data-i18n="st.advTemp"></span>
    <input id="stTemp" type="number" min="1" step="1" value="50" inputmode="numeric" /></label>
  <label class="fld"><span data-i18n="st.advPrepare"></span>
    <select id="stPrepareMode">${(['source', 'dense', 'off'] as const).map((v) => `<option value="${v}">${t(PREPARE_LABELS[v])}</option>`).join('')}</select></label>
</div>`;

/** Wires the Advanced row to PAR. `fps` is the video frame rate state: the select writes its pick, `sync` shows what the video measured. */
export const initAdvanced = (par: PARRenderer, fps: VideoFpsState, onVideoFps: () => void) => {
  const mode = $<HTMLSelectElement>('stRenderMode');
  const rate = $<HTMLSelectElement>('stRenderFps');
  const video = $<HTMLSelectElement>('stVideoFps');
  const offset = $<HTMLInputElement>('stOffset');
  const range = $<HTMLSelectElement>('stWarmRange');
  const temp = $<HTMLInputElement>('stTemp');
  const prepare = $<HTMLSelectElement>('stPrepareMode');

  const modeValue = (): PrepareMode => readMode(prepare.value);
  mode.addEventListener('change', () => par.setOptions({ renderMode: mode.value as 'auto' | 'dom' | 'canvas' }));
  rate.addEventListener('change', () => par.setOptions({ fps: (rate.value === 'auto' ? 'auto' : Number(rate.value)) as FpsOption }));
  video.addEventListener('change', () => { fps.picked = video.value === '' ? null : Number(video.value); par.setOptions({ videoFps: fps.option }); onVideoFps(); });
  offset.addEventListener('change', () => { const v = Number(offset.value); par.setOptions({ timeOffset: Number.isFinite(v) ? v : 0 }); });
  range.addEventListener('change', () => { const v = Number(range.value); par.setOptions({ warmRangeSeconds: Number.isFinite(v) ? v : 30 }); });
  temp.addEventListener('change', () => { const v = Number(temp.value); par.setOptions({ temperature: Number.isFinite(v) && v >= 1 ? Math.floor(v) : 50 }); });
  prepare.addEventListener('change', () => par.setOptions({ seekBuffer: modeValue() !== 'off' }));

  /** The "auto" entry of the video FPS select names the measured rate; call after the video (or the language) changed. */
  const sync = (): void => {
    const first = video.options[0]!;
    first.textContent = fps.detected !== null ? t('st.autoVideo', { fps: fps.detected }) : t('st.autoUnknown');
    video.value = fps.picked === null ? '' : String(fps.picked);
    for (const label of document.querySelectorAll<HTMLElement>('#stPrepareMode option')) label.textContent = t(PREPARE_LABELS[readMode(label.getAttribute('value') ?? 'source')]);
  };
  sync();
  /** The choices as the generated code needs them. */
  const values = () => ({
    renderMode: mode.value as 'auto' | 'dom' | 'canvas',
    fps: (rate.value === 'auto' ? 'auto' : Number(rate.value)) as 'auto' | number,
    videoFps: fps.option,
    timeOffset: Number.isFinite(Number(offset.value)) ? Number(offset.value) : 0,
    warmRangeSeconds: Number.isFinite(Number(range.value)) ? Number(range.value) : 30,
    temperature: Number.isFinite(Number(temp.value)) && Number(temp.value) >= 1 ? Math.floor(Number(temp.value)) : 50,
    prepareMode: modeValue(),
  });
  return { sync, values };
};
