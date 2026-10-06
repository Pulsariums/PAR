import { parseDrawing } from '../parser/DrawingParser';
import type { ClipSpec } from '../types/script';

import { drawingToPath } from './drawingPath';

const FAR = 1e6;
const OUTER = `M ${-FAR} ${-FAR} H ${FAR} V ${FAR} H ${-FAR} Z`;
const f = (n: number) => String(Math.round(n * 1000) / 1000);

/** SVG path data of a clip region in layout coordinates, and its fill rule (inverse clips are an even-odd hole in a huge rectangle). */
export interface ClipShape {
  d: string;
  evenodd: boolean;
}

const EMPTY: ClipShape = { d: 'M 0 0 Z', evenodd: false };

/** `\clip` / `\iclip` => region (null = no clipping). Shared by the CSS and the canvas renderers. */
export const clipShape = (clip: ClipSpec | undefined): ClipShape | null => {
  if (!clip) return null;
  let inner: string;
  if (clip.rect) {
    const [x1, y1, x2, y2] = clip.rect;
    // libass does not reorder the corners: an empty rect hides everything (`\clip`) or nothing (`\iclip`).
    if (x2 <= x1 || y2 <= y1) return clip.inverse ? null : EMPTY;
    inner = `M ${f(x1)} ${f(y1)} H ${f(x2)} V ${f(y2)} H ${f(x1)} Z`;
  } else if (clip.drawing) {
    inner = drawingToPath(parseDrawing(clip.drawing), clip.scale ?? 1);
    if (!inner) return clip.inverse ? null : EMPTY;
    if (!inner.endsWith('Z')) inner += ' Z';
  } else return null;
  return clip.inverse ? { d: `${OUTER} ${inner}`, evenodd: true } : { d: inner, evenodd: false };
};

/** The shape as CSS `clip-path` (applied to an element whose origin is the layout origin). */
export const clipPathCss = (clip: ClipSpec | undefined): string => {
  const s = clipShape(clip);
  if (!s) return 'none';
  return s.evenodd ? `path(evenodd, "${s.d}")` : `path("${s.d}")`;
};
