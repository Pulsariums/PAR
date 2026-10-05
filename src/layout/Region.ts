import type { Rect, RegionOption } from '../types/options';

export type ObjectFit = 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';

/**
 * Rect of the visible picture inside `box` for a media of `iw` x `ih` (CSS object-fit,
 * object-position centred). Unknown intrinsic size => the whole box.
 */
export const fitRect = (box: Rect, iw: number, ih: number, fit: ObjectFit = 'contain'): Rect => {
  if (!(iw > 0 && ih > 0) || fit === 'fill' || box.width <= 0 || box.height <= 0) return { ...box };
  const contain = Math.min(box.width / iw, box.height / ih);
  let s: number;
  if (fit === 'cover') s = Math.max(box.width / iw, box.height / ih);
  else if (fit === 'none') s = 1;
  else if (fit === 'scale-down') s = Math.min(1, contain);
  else s = contain;
  // Exact box edge on the limiting axis (avoids 1000.0000000000001-style drift).
  const width = s === box.width / iw ? box.width : iw * s;
  const height = s === box.height / ih ? box.height : ih * s;
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
};

export const parseObjectFit = (v: string | null | undefined): ObjectFit =>
  v === 'cover' || v === 'fill' || v === 'none' || v === 'scale-down' ? v : 'contain';

export interface RegionInput {
  /** Container padding-box size. */
  containerWidth: number;
  containerHeight: number;
  /** Video content box relative to the container (null without a video). */
  videoBox: Rect | null;
  videoWidth: number;
  videoHeight: number;
  objectFit: ObjectFit;
}

/** Resolves the `region` option to a rect in container pixels. */
export const resolveRegion = (option: RegionOption, input: RegionInput): Rect => {
  const container: Rect = { x: 0, y: 0, width: input.containerWidth, height: input.containerHeight };
  if (typeof option === 'object') return { ...option };
  if (option === 'container' || !input.videoBox) return container;
  return fitRect(input.videoBox, input.videoWidth, input.videoHeight, input.objectFit);
};
