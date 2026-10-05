import { parseDrawing } from '../parser/DrawingParser';
import type { ClipSpec } from '../types/script';

import { drawingToPath } from './drawingPath';

const FAR = 1e6;
const OUTER = `M ${-FAR} ${-FAR} H ${FAR} V ${FAR} H ${-FAR} Z`;
const f = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * `\clip` / `\iclip` => CSS `clip-path` in layout coordinates (applied to an element whose origin
 * is the layout origin). Inverse clips use an even-odd hole in a huge outer rectangle.
 */
export const clipPathCss = (clip: ClipSpec | undefined): string => {
  if (!clip) return 'none';
  let inner: string;
  if (clip.rect) {
    const [x1, y1, x2, y2] = clip.rect;
    inner = `M ${f(x1)} ${f(y1)} H ${f(x2)} V ${f(y2)} H ${f(x1)} Z`;
  } else if (clip.drawing) {
    inner = drawingToPath(parseDrawing(clip.drawing), clip.scale ?? 1);
    if (!inner) return clip.inverse ? 'none' : 'path("M 0 0 Z")';
    if (!inner.endsWith('Z')) inner += ' Z';
  } else return 'none';
  return clip.inverse ? `path(evenodd, "${OUTER} ${inner}")` : `path("${inner}")`;
};
