import { drawingBounds, parseDrawing, rectOfDrawing } from '../parser/DrawingParser';
import type { ClipSpec } from '../types/script';

import { drawingToPath } from './drawingPath';

const FAR = 1e6;
const OUTER = `M ${-FAR} ${-FAR} H ${FAR} V ${FAR} H ${-FAR} Z`;
const f = (n: number) => String(Math.round(n * 1000) / 1000);

/** SVG path data of a clip region in layout coordinates, and its fill rule (inverse clips are an even-odd hole in a huge rectangle). */
export interface ClipShape {
  d: string;
  evenodd: boolean;
  /** Set for a plain (non-inverse) rect clip: canvas clips with `rect()`, far cheaper than a path. */
  rect?: [number, number, number, number];
  /** Bounding box of a non-inverse vector clip (layout units): lets the canvas bake the clip into a small sprite. */
  bbox?: [number, number, number, number];
}

const EMPTY: ClipShape = { d: 'M 0 0 Z', evenodd: false };

const memo = new WeakMap<ClipSpec, ClipShape | null>();

/** `\clip` / `\iclip` => region (null = no clipping). Shared by the CSS and the canvas renderers; a spec's shape is computed once. */
export const clipShape = (clip: ClipSpec | undefined): ClipShape | null => {
  if (!clip) return null;
  if (memo.has(clip)) return memo.get(clip)!;
  const s = computeShape(clip);
  memo.set(clip, s);
  return s;
};

const computeShape = (clip: ClipSpec): ClipShape | null => {
  let inner: string;
  let bbox: [number, number, number, number] | undefined;
  let boxRect: [number, number, number, number] | undefined;
  if (clip.rect) {
    const [x1, y1, x2, y2] = clip.rect;
    // libass does not reorder the corners: an empty rect hides everything (`\clip`) or nothing (`\iclip`).
    if (x2 <= x1 || y2 <= y1) return clip.inverse ? null : EMPTY;
    inner = `M ${f(x1)} ${f(y1)} H ${f(x2)} V ${f(y2)} H ${f(x1)} Z`;
  } else if (clip.drawing) {
    const cmds = parseDrawing(clip.drawing);
    inner = drawingToPath(cmds, clip.scale ?? 1);
    const b = drawingBounds(cmds);
    const k = (clip.scale ?? 1) > 1 ? Math.pow(2, (clip.scale ?? 1) - 1) : 1;
    if (b) bbox = [b[0] / k, b[1] / k, b[2] / k, b[3] / k];
    const r = rectOfDrawing(cmds);
    if (r) boxRect = [r[0] / k, r[1] / k, r[2] / k, r[3] / k];
    if (!inner) return clip.inverse ? null : EMPTY;
    if (!inner.endsWith('Z')) inner += ' Z';
  } else return null;
  if (clip.inverse) return { d: `${OUTER} ${inner}`, evenodd: true };
  if (clip.rect) return { d: inner, evenodd: false, rect: clip.rect };
  // A rectangle drawn as a vector clip clips like a rect (the canvas applies `rect()`, far cheaper than a path).
  return boxRect ? { d: inner, evenodd: false, rect: boxRect } : { d: inner, evenodd: false, bbox };
};

/** The shape as CSS `clip-path` (applied to an element whose origin is the layout origin). */
export const clipPathCss = (clip: ClipSpec | undefined): string => {
  const s = clipShape(clip);
  if (!s) return 'none';
  return s.evenodd ? `path(evenodd, "${s.d}")` : `path("${s.d}")`;
};
