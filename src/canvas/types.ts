import type { ClipShape } from '../render/clipCss';

/** `'auto'`: lines that qualify go to the canvas path when a scene is heavy; `'dom'`: never; `'canvas'`: whenever they qualify. */
export type RenderMode = 'auto' | 'dom' | 'canvas';

/** One painted layer of a sprite (shadow, outline, fill, or all of them for plain lines), colours already blended with alpha. */
export interface PlateSpec {
  fill: string | null;
  stroke: string | null;
  /** Stroke width in layout units (centred on the contour). */
  strokeW: number;
  /** Offset in layout units before the horizontal scale. */
  dx: number;
  dy: number;
  /** Gaussian sigma in layout units; 0 = sharp. */
  blur: number;
  /** Cut the glyph shape out of this plate (libass: translucent fill leaves the border bitmap hollow). */
  carve: boolean;
  /** Plain-line text shadow, painted under the stroke and fill of the same plate. */
  shadow: { dx: number; dy: number; colour: string } | null;
}

/** Everything a sprite bitmap depends on. Two equal specs are the same bitmap (see `specKey`). */
export interface SpriteSpec {
  text: string;
  family: string;
  weight: number;
  italic: boolean;
  /** Font size class in layout px (the line-height of the box). */
  size: number;
  /** CSS font-size per layout px. */
  ratio: number;
  /** Horizontal scale (`\fscx / \fscy`). */
  rx: number;
  /** Letter spacing in layout px (added after every glyph, like CSS `letter-spacing`). */
  spacing: number;
  kerning: boolean;
  plates: PlateSpec[];
  /** Device pixels per layout unit the bitmap is rasterised at. */
  scale: number;
}

/** What to draw for one event in one frame: pure data, no canvas objects. */
export interface DrawItem {
  id: string;
  index: number;
  layer: number;
  spec: SpriteSpec;
  key: string;
  /** Opacity 0..1 (shared alpha of the colours times the fade). */
  alpha: number;
  anchor: [number, number];
  org: [number, number];
  /** Canvas rotation in degrees (`-\frz`). */
  rot: number;
  /** Font size this frame, layout px (the sprite is scaled by `size / spec.size`). */
  size: number;
  ax: number;
  ay: number;
  /** Shear in the final (horizontally scaled) space, about the box's top-left corner: x' = x + shx * y, y' = y + shy * x (`\fax` / `\fay` with the x-scale folded in, as the DOM path composes them). */
  shx: number;
  shy: number;
  clip: ClipShape[];
  /** Position, size and clip stay as they are for the event's life and it lasts a while: worth baking a vector clip into the sprite. */
  still: boolean;
}

/** Counters of the canvas path (`PARMetrics.render`). */
export interface CanvasStats {
  sprites: number;
  spriteBytes: number;
  spriteHits: number;
  spriteMisses: number;
  /** Sprites built ahead of time by the lookahead (not counted as misses). */
  prewarmed: number;
  evictions: number;
  /** Blurs left out because the frame ran out of sprite-building time or the blur was below ~0.35 device px. */
  detailDropped: number;
  /** Items not drawn because their sprite could not be built (too large / no canvas). */
  skipped: number;
  runs: number;
  /** Items drawn and device pixels covered (megapixels, sprite rectangles incl. transparent margin) in the last frame. */
  drawn: number;
  fillMpx: number;
  /** Runs beyond the canvas pool size that were merged into the last one (z-order approximated). */
  runsMerged: number;
}
