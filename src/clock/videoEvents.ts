export interface VideoHandlers {
  /** Playback started: run the render loop. */
  play(): void;
  /** Playback stopped: stop the loop, render the final frame. */
  pause(): void;
  /** Time jumped while possibly paused: render once. */
  seek(): void;
  /** Intrinsic size / metadata changed: re-measure the region. */
  resize(): void;
}

const MAP: Record<string, keyof VideoHandlers> = {
  play: 'play',
  playing: 'play',
  pause: 'pause',
  ended: 'pause',
  emptied: 'pause',
  waiting: 'seek',
  seeking: 'seek',
  seeked: 'seek',
  timeupdate: 'seek',
  ratechange: 'seek',
  loadedmetadata: 'resize',
  loadeddata: 'resize',
  resize: 'resize',
};

/** Subscribes to the media events PAR needs; returns the unsubscribe function. */
export const bindVideoEvents = (video: HTMLVideoElement, h: VideoHandlers): (() => void) => {
  const listeners = Object.entries(MAP).map(([ev, key]) => {
    const fn = () => h[key]();
    video.addEventListener(ev, fn);
    return [ev, fn] as const;
  });
  return () => listeners.forEach(([ev, fn]) => video.removeEventListener(ev, fn));
};

/** True while the video is actually advancing. */
export const isPlaying = (v: HTMLVideoElement): boolean => !v.paused && !v.ended;
