import { detectFps } from '../studio/exportPlan';

import type { WatchStage } from './stage';

type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number };

/**
 * Measures the video's frame rate from the frames it shows while it plays (no second decoder), then tells PAR so that subtitle times
 * snap to the video's frame grid like a player does. Runs once per video, costs a callback per frame for the first ~60 frames.
 */
export const watchFps = (stage: WatchStage): void => {
  const v = stage.video as FrameVideo;
  if (typeof v.requestVideoFrameCallback !== 'function') return;
  let times: number[] = [];
  let done = false;
  let armed = false;
  const reset = (): void => { times = []; done = false; };
  const step = (): void => {
    armed = true;
    v.requestVideoFrameCallback!((_n, meta) => {
      armed = false;
      if (done) return;
      const last = times[times.length - 1];
      if (last !== undefined && (meta.mediaTime <= last || meta.mediaTime - last > 0.5)) times = [];
      times.push(meta.mediaTime);
      if (times.length >= 60) { done = true; const f = detectFps(times); if (f) stage.par.setOptions({ videoFps: f }); return; }
      step();
    });
  };
  v.addEventListener('loadedmetadata', reset);
  v.addEventListener('play', () => { if (!done && !armed) step(); });
};
