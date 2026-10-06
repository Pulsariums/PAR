/** Calls `cb` when the container or video changes size. Returns the stop function (a no-op without ResizeObserver). */
export const observeSize = (container: HTMLElement, video: HTMLVideoElement | null, cb: () => void): (() => void) => {
  if (typeof ResizeObserver !== 'function') return () => undefined;
  const ro = new ResizeObserver(cb);
  ro.observe(container);
  if (video) ro.observe(video);
  return () => ro.disconnect();
};
