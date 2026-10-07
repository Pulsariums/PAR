export type OptimizeMode = 'exact' | 'invisible' | 'loose';

export interface OptimizeOptions {
  /** Frame rate the picture is judged at (the video's): the optimised script must look the same on these frames. */
  fps: number;
  /** `'invisible'` (default): errors below what a pixel can show (the PAR bake tolerance, 1/8 px at the script's height). `'exact'`: errors 100 times smaller. `'loose'`: four times larger. */
  mode?: OptimizeMode;
  /** Shortest run of consecutive frame-by-frame events worth merging (default 3). */
  minChain?: number;
  signal?: AbortSignal;
  onProgress?(fraction: number): void;
}

export interface OptimizeStats {
  /** Dialogue lines read / written. */
  eventsIn: number;
  eventsOut: number;
  /** Runs of consecutive same-shape events found (length >= minChain). */
  chains: number;
  /** Merged events written (each replaced two or more lines). */
  merged: number;
  /** Lines saved. */
  removed: number;
  /** Merged events thrown away because the check against PAR's own evaluation found a difference (their original lines stay). */
  rejected: number;
  /** Merged events given up because merging would have changed the drawing order of overlapping events. */
  orderConflicts: number;
  /** Largest error found by the check, as a share of the allowed tolerance (0..1). */
  worstError: number;
}

export interface OptimizeResult {
  text: string;
  stats: OptimizeStats;
}
