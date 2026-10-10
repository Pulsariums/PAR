import type { PARRenderer } from '../../../src/index';
import { t } from '../i18n/i18n';
import { $ } from '../player/dom';
import { VIDEO_MARKS } from '../player/fpsMarks';

import type { VideoFpsState } from './fpsState';

const opts = (values: readonly number[]): string => values.map((v) => `<option value="${v}">${v}</option>`).join('');
/** How far ahead live preparation may look, in subtitle seconds. */
export const WARM_RANGE_MARKS = [10, 30, 60, 120, 300] as const;
/** Coarse buffer presets: the warm range they pick when the range select was not touched by hand. */
const BUFFER_AUTO = 'auto';
const BUFFER_MARKS: Record<string, number> = { small: 15, [BUFFER_AUTO]: 60, large: 120 };
/** The scene-pending threshold is fixed internally at the engine default (50); no field for it. */
const TEMPERATURE = 50;
/** Expert overrides, persisted under this localStorage key as JSON. */
const PERF_KEY = 'par.perf';
interface Saved {
  renderMode?: string; videoFps?: number | null; timeOffset?: number;
  buffer?: string; warmRange?: number;
}
const load = (): Saved => {
  try { return JSON.parse(localStorage.getItem(PERF_KEY) ?? '{}') as Saved; } catch { return {}; }
};
const persist = (v: Saved): void => {
  try { localStorage.setItem(PERF_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
};

/**
 * Markup of the Expert disclosure (collapsed by default: everything auto). A closed `<details>` is deliberate —
 * an open one queues a jsdom toggle task that breaks the Watch timer-cleanup tests.
 */
export const ADVANCED_HTML = `
<details class="st-fold" id="stExpert">
  <summary><span data-i18n="st.expert"></span></summary>
  <div class="row st-adv">
    <label class="fld"><span data-i18n="st.advOffset"></span>
      <input id="stOffset" type="number" step="0.1" value="0" inputmode="decimal" /></label>
    <label class="fld"><span data-i18n="st.advMode"></span>
      <select id="stRenderMode"><option value="auto">auto</option><option value="canvas">canvas</option><option value="dom">dom</option></select></label>
    <label class="fld"><span data-i18n="st.advVideoFps"></span>
      <select id="stVideoFps"><option value=""></option>${opts(VIDEO_MARKS)}</select></label>
    <label class="fld"><span data-i18n="st.advBuffer"></span>
      <select id="stBufferMode"><option value="${BUFFER_AUTO}" data-i18n="st.auto"></option><option value="small" data-i18n="st.bufferSmall"></option><option value="large" data-i18n="st.bufferLarge"></option></select></label>
    <label class="fld"><span data-i18n="st.advWarmRange"></span>
      <select id="stWarmRange">${WARM_RANGE_MARKS.map((v) => `<option value="${v}"${v === 60 ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
  </div>
</details>`;

/** Wires the Expert row to PAR and persists the overrides. `fps` is the video frame rate state: the select writes its pick, `sync` shows what the video measured. */
export const initAdvanced = (par: PARRenderer, fps: VideoFpsState, onVideoFps: () => void) => {
  const mode = $<HTMLSelectElement>('stRenderMode');
  const video = $<HTMLSelectElement>('stVideoFps');
  const offset = $<HTMLInputElement>('stOffset');
  const range = $<HTMLSelectElement>('stWarmRange');
  const buffer = $<HTMLSelectElement>('stBufferMode');

  const saved = load();
  const clampNum = (v: unknown, dflt: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : dflt);
  mode.value = saved.renderMode === 'canvas' || saved.renderMode === 'dom' ? saved.renderMode : 'auto';
  offset.value = String(clampNum(saved.timeOffset, 0));
  if (typeof saved.warmRange === 'number' && (WARM_RANGE_MARKS as readonly number[]).includes(saved.warmRange)) range.value = String(saved.warmRange);
  buffer.value = saved.buffer === 'small' || saved.buffer === 'large' ? saved.buffer : BUFFER_AUTO;
  if (typeof saved.videoFps === 'number' && (VIDEO_MARKS as readonly number[]).includes(saved.videoFps)) { fps.picked = saved.videoFps; video.value = String(saved.videoFps); onVideoFps(); }

  /** Effective warm range: the buffer preset, unless the range select was set by hand (which resets the preset to auto). */
  const warmRange = (): number => (buffer.value === BUFFER_AUTO ? clampNum(Number(range.value), 60) : BUFFER_MARKS[buffer.value] ?? 60);

  const save = (): void => persist({
    renderMode: mode.value, timeOffset: clampNum(Number(offset.value), 0),
    buffer: buffer.value, warmRange: Number(range.value), videoFps: fps.picked,
  });
  mode.addEventListener('change', () => { par.setOptions({ renderMode: mode.value as 'auto' | 'dom' | 'canvas' }); save(); });
  video.addEventListener('change', () => { fps.picked = video.value === '' ? null : Number(video.value); par.setOptions({ videoFps: fps.option }); onVideoFps(); save(); });
  offset.addEventListener('change', () => { const v = Number(offset.value); par.setOptions({ timeOffset: Number.isFinite(v) ? v : 0 }); save(); });
  range.addEventListener('change', () => { buffer.value = BUFFER_AUTO; par.setOptions({ warmRangeSeconds: warmRange() }); save(); });
  buffer.addEventListener('change', () => { par.setOptions({ warmRangeSeconds: warmRange() }); save(); });

  // Restore the persisted overrides onto the engine (the temperature stays at its default; the first-play prepare sweep is always 'dense').
  par.setOptions({
    renderMode: mode.value as 'auto' | 'dom' | 'canvas',
    videoFps: fps.option,
    timeOffset: clampNum(Number(offset.value), 0),
    warmRangeSeconds: warmRange(),
    temperature: TEMPERATURE,
  });

  /** The "auto" entry of the video FPS select names the measured rate; call after the video (or the language) changed. */
  const sync = (): void => {
    const first = video.options[0]!;
    first.textContent = fps.detected !== null ? t('st.autoVideo', { fps: fps.detected }) : t('st.autoUnknown');
    video.value = fps.picked === null ? '' : String(fps.picked);
  };
  sync();
  /** The choices as the generated code needs them. The render fps cap is gone: PAR picks its own rate. */
  const values = () => ({
    renderMode: mode.value as 'auto' | 'dom' | 'canvas',
    fps: 'auto' as const,
    videoFps: fps.option,
    timeOffset: clampNum(Number(offset.value), 0),
    warmRangeSeconds: warmRange(),
    temperature: TEMPERATURE,
  });
  return { sync, values };
};
