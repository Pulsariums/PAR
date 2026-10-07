export interface AnalyzeOptions {
  /** Frame rate the picture is shown at (default 24): visible lines are counted per frame, sprite samples fall on this grid. */
  fps?: number;
  /** Width in device pixels the video is drawn at (default: the script's layout width, scale 1). Sprite keys depend on it. */
  width?: number;
  /** Seconds read per window when the input is a `SubtitleSource` (default 20). */
  windowSeconds?: number;
  /** A burst is a frame where at least this many more lines are visible than on the frame before (default 40). */
  burstMin?: number;
  /** Most distinct sprite keys remembered (default 400,000); past it new keys are only counted. */
  maxKeys?: number;
  /** Most sprite keys listed (by first use) in the report (default 2,000, 0 = none). */
  listKeys?: number;
  /** Find runs of frame-by-frame events (text input only, default true). */
  chains?: boolean;
  signal?: AbortSignal;
  onProgress?(fraction: number): void;
}

export interface SecondRow {
  /** Second of the video. */
  s: number;
  /** Events that start in it. */
  starts: number;
  /** Most lines visible at once on a frame of it. */
  visible: number;
  /** Sprite lookups its canvas lines make (every sampled frame of every event, one per distinct key per event). */
  requests: number;
  /** Distinct sprite keys needed in it, and the ones needed for the first time. */
  keys: number;
  newKeys: number;
  /** Estimated ms to build the sprites first used in it (masks included). */
  buildMs: number;
}

export interface Burst {
  /** Time of the first frame of the jump, seconds. */
  at: number;
  before: number;
  peak: number;
  /** Sprites first used from the jump to just after its peak, and what they cost to build (est. ms). */
  newKeys: number;
  buildMs: number;
}

export interface KeyUse {
  key: string;
  /** First time (seconds) the sprite is drawn. */
  at: number;
  uses: number;
  buildMs: number;
}

export interface ChainSummary {
  chains: number;
  /** Events inside the chains. */
  events: number;
  /** Events fewer if every chain were merged to one (the optimizer's own check may reject some). */
  saveable: number;
}

export interface AnalyzeReport {
  schema: 'par-analyze/1';
  input: { events: number; durationS: number; layout: [number, number]; fps: number; scale: number; bytes: number | null };
  peak: { visible: number; at: number };
  seconds: SecondRow[];
  bursts: Burst[];
  sprites: { distinct: number; masks: number; requests: number; keysCapped: boolean; buildMs: number; megabytes: number; msPerSprite: number };
  keys: KeyUse[];
  canvas: { events: number; share: number; lineSeconds: number; lineSecondsShare: number; reasons: Record<string, number> };
  chains: ChainSummary | null;
  styles: { defined: number; unused: string[]; fonts: Array<{ family: string; events: number }>; unusedFonts: string[] };
}
