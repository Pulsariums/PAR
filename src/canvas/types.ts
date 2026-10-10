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
  /**
   * The line animates `\blur`: the plates are built sharp (every `PlateSpec.blur` is 0) and the exact per-frame sigma is applied at
   * composition time (`DrawItem.blur`, see `CanvasLayer`). Such sprites live in their own key namespace (`specKey`) and share one
   * bitmap across the frames of the animation instead of one per blur class; static blur stays baked exactly as before.
   */
  animBlur?: boolean;
  /** Extra margin (layout units) around the whole bitmap: room for the widest blur tail the line can reach (`3 * sigmaMaxForClass`). */
  pad?: number;
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
  /** Horizontal scale ratio this frame (\fscx / \fscy). */
  rx?: number;
  ax: number;
  ay: number;
  /** Shear in the final (horizontally scaled) space, about the box's top-left corner: x' = x + shx * y, y' = y + shy * x (`\fax` / `\fay` with the x-scale folded in, as the DOM path composes them). */
  shx: number;
  shy: number;
  /**
   * Exact per-frame gaussian sigma (layout units) to apply to the sprite at composition time (`spec.animBlur` sprites are built
   * sharp; the blur tail lives in `spec.pad`). Undefined = the bitmap is complete as it is (static blur, baked at its exact sigma).
   */
  blur?: number;
  clip: ClipShape[];
  /** Position, size and clip stay as they are for the event's life and it lasts a while: worth baking a vector clip into the sprite. */
  still: boolean;
}

/** Counters of the canvas path itself. */
export interface PathStats {
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
  /** Items left out of the last frame to meet the pixel budget, and the budget in megapixels (0 = no limit). */
  shed: number;
  shedBudgetMpx: number;
  /** Runs beyond the canvas pool size that were merged into the last one (z-order approximated). */
  runsMerged: number;
  /** Items of the last frame whose sprite was not ready when the frame needed it, the same summed over all frames, and frames not presented because of it (the previous picture stayed). */
  missing: number;
  missedTotal: number;
  held: number;
  /** Time the last frame spent drawing its finished sprites (ms). */
  compositeMs: number;
}

/** Opt-in counters for one canvas composition. These are absent from normal playback metrics. */
export interface CanvasProfile {
  /** Number of `drawImage` calls issued by the composition pass. */
  drawImages: number;
  /** Canvas drawing calls, including slot clears and `drawImage`. */
  drawOps: number;
  /** Context state mutations issued by the composition pass. */
  stateChanges: number;
  /** Sprite cache lookups made while resolving this frame. */
  spriteLookups: number;
  spriteHits: number;
  spriteMisses: number;
  /** JavaScript time spent in the canvas render path, including resolution. */
  jsMs: number;
  /** Bounded hash of the effective ordered frame inputs and resolution results. */
  signature: string;
}

/** Counters of the look-ahead: the warm plan and the sprite workers. */
export interface WarmStats {
  /** Sprite workers running (0 = every sprite is built on the main thread) and sprites they have delivered. */
  workers: number;
  workerBuilt: number;
  /** Sprites in the warm plan not yet built, and megabytes of built-ahead sprites not yet due. */
  planQueued: number;
  aheadMB: number;
  /** How far ahead of the playhead the plan has looked (ms of subtitle time). */
  leadMs: number;
  /** Sprites planned and not available yet, and how far ahead of the playhead everything planned is available (ms; Infinity-capped at the plan's own lead). */
  pending: number;
  readyMs: number;
  /** Measured build throughput (ms of estimated work per ms of wall time, 0 = none yet) and the wait (ms) the builders would need to get everything built before it is drawn. */
  rate: number;
  deficitMs: number;
  /** Main-thread wall ms of one planned-and-built sprite on this machine (0 = none measured). */
  buildMs: number;
}

/** Counters of the canvas path (`PARMetrics.render`). */
export type CanvasStats = PathStats & WarmStats;
