const PREFIX = 'par.pos.';
const keyOf = (f: File): string => `${PREFIX}${f.name}.${f.size}`;

const read = (k: string): number => {
  try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; }
};
const write = (k: string, v: number): void => {
  try { localStorage.setItem(k, String(Math.round(v))); } catch { /* private window or blocked storage: no resume */ }
};

/**
 * Remembers where a video was left (per file name and size, in this browser only) and seeks back there when it loads again.
 * `track(null)` stops saving; call it before swapping the source, then `track(file)` once the new source is set.
 */
export const initResume = (video: HTMLVideoElement): { track(file: File | null): void } => {
  let key: string | null = null;
  let last = 0;
  const save = (): void => { if (key) write(key, video.currentTime); };
  video.addEventListener('loadedmetadata', () => {
    if (!key) return;
    const at = read(key);
    if (at > 5 && at < video.duration - 10) video.currentTime = at;
  });
  video.addEventListener('timeupdate', () => {
    if (!key || Date.now() - last < 2000) return;
    last = Date.now();
    save();
  });
  video.addEventListener('pause', save);
  video.addEventListener('ended', () => { if (key) write(key, 0); });
  return {
    track(file: File | null): void {
      key = file ? keyOf(file) : null;
    },
  };
};
