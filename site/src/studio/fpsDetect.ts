import { detectFps } from './exportPlan';

type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number };

/** Collects `n` presentation times from a playing video through requestVideoFrameCallback; resolves with what it got after `ms`. */
const frames = (v: FrameVideo, n: number, ms: number): Promise<number[]> => new Promise((done) => {
  const times: number[] = [];
  const finish = (): void => done(times);
  const timer = window.setTimeout(finish, ms);
  const next = (): void => {
    v.requestVideoFrameCallback!((_now, meta) => {
      if (!times.length || meta.mediaTime > times[times.length - 1]!) times.push(meta.mediaTime);
      if (times.length >= n) { window.clearTimeout(timer); finish(); } else next();
    });
  };
  next();
});

/**
 * The frame rate of a video file, measured on a detached muted copy that plays for a moment (the visible player is not touched).
 * Null when the browser has no requestVideoFrameCallback, cannot play the file, or the steps match no known rate.
 */
export const probeFps = async (url: string): Promise<number | null> => {
  const v = document.createElement('video') as FrameVideo;
  if (typeof v.requestVideoFrameCallback !== 'function') return null;
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  try {
    await v.play();
    return detectFps(await frames(v, 50, 4000));
  } catch {
    return null;
  } finally {
    v.pause();
    v.removeAttribute('src');
    v.load();
  }
};
