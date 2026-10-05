import { parseObjectFit, type RegionInput } from '../layout/Region';

const num = (v: string): number => parseFloat(v) || 0;

/** Reads container and video geometry from the DOM (the only layout reads besides collisions). */
export const measureRegionInput = (container: HTMLElement, video: HTMLVideoElement | null): RegionInput => {
  const base = { containerWidth: container.clientWidth, containerHeight: container.clientHeight };
  if (!video || !video.isConnected) {
    return { ...base, videoBox: null, videoWidth: 0, videoHeight: 0, objectFit: 'contain' };
  }
  const cr = container.getBoundingClientRect();
  const vr = video.getBoundingClientRect();
  const cs = video.ownerDocument.defaultView?.getComputedStyle(video);
  const pl = cs ? num(cs.paddingLeft) : 0;
  const pr = cs ? num(cs.paddingRight) : 0;
  const pt = cs ? num(cs.paddingTop) : 0;
  const pb = cs ? num(cs.paddingBottom) : 0;
  return {
    ...base,
    videoBox: {
      x: vr.left - cr.left - container.clientLeft + video.clientLeft + pl,
      y: vr.top - cr.top - container.clientTop + video.clientTop + pt,
      width: Math.max(0, video.clientWidth - pl - pr),
      height: Math.max(0, video.clientHeight - pt - pb),
    },
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    objectFit: parseObjectFit(cs?.objectFit),
  };
};
