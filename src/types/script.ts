/** Data model produced by the parser. Pure data: no DOM, no functions. */

/** A style from `[V4+ Styles]` / `[V4 Styles]`, normalized. Colours are `0xBBGGRR`, alphas 0 (opaque)..255. */
export interface AssStyle {
  name: string;
  fontName: string;
  fontSize: number;
  primaryColour: number;
  secondaryColour: number;
  outlineColour: number;
  backColour: number;
  primaryAlpha: number;
  secondaryAlpha: number;
  outlineAlpha: number;
  backAlpha: number;
  /** 0 = normal, 1/-1 = bold, 100..900 = explicit weight. */
  bold: number;
  italic: boolean;
  underline: boolean;
  strikeOut: boolean;
  scaleX: number;
  scaleY: number;
  spacing: number;
  angle: number;
  /** 1 = outline + drop shadow, 3 = opaque box. */
  borderStyle: number;
  outline: number;
  shadow: number;
  /** Numpad alignment 1..9 (legacy SSA alignment is converted). */
  alignment: number;
  marginL: number;
  marginR: number;
  marginV: number;
  encoding: number;
}

export interface ScriptInfo {
  /** Raw key/value pairs of `[Script Info]` (keys as written). */
  raw: Record<string, string>;
  scriptType: string;
  /** PlayResX/Y after libass fallback rules (never 0). */
  playResX: number;
  playResY: number;
  /** True when PlayResX/Y were (partly) missing and a fallback was used. */
  playResFallback: boolean;
  layoutResX: number | null;
  layoutResY: number | null;
  scaledBorderAndShadow: boolean;
  /** True when the header key was written (the custom-Format compat rule then does not apply). */
  scaledBorderAndShadowSet: boolean;
  /** `Kerning:` header (libass: off unless yes). */
  kerning: boolean;
  /** 0..3, default 0. */
  wrapStyle: number;
}

/** Override tag keys that live in the per-fragment text state. */
export type StateKey =
  | 'fn' | 'fs' | 'b' | 'i' | 'u' | 's' | 'fscx' | 'fscy' | 'fsp'
  | 'frx' | 'fry' | 'frz' | 'fax' | 'fay'
  | 'xbord' | 'ybord' | 'xshad' | 'yshad' | 'blur' | 'be' | 'pbo'
  | 'c1' | 'c2' | 'c3' | 'c4' | 'a1' | 'a2' | 'a3' | 'a4';

/** `value: null` means "revert to the style value" (e.g. `\fs` without argument). */
export interface SetOp {
  type: 'set';
  key: StateKey;
  value: number | string | null;
  /** `\fs+N` / `\fs-N`: relative font size step (libass). */
  relative?: boolean;
}

/** `\t([t1,t2,][accel,]tags)`; times in ms relative to line start. Times omitted => `t1 = 0, t2 = null` (line end). */
export interface Transition {
  type: 't';
  t1: number;
  /** `null` = line end (libass: times not given). */
  t2: number | null;
  accel: number;
  /** Sets and `\r` resets inside the `\t`; animatable keys interpolate, the others apply unconditionally (libass). */
  ops: (SetOp | ResetOp)[];
  /** Rect clip target inside the transition, if any. */
  clip?: [number, number, number, number];
}

/** `\r` / `\r<style>`: reset state to the line style or a named style. */
export interface ResetOp {
  type: 'r';
  style: string | null;
}

export type StateOp = SetOp | Transition | ResetOp;

export interface ClipSpec {
  inverse: boolean;
  /** Rect clip `x1,y1,x2,y2` in script coordinates. */
  rect?: [number, number, number, number];
  /** Vector clip: ASS drawing commands with `scale` (`\clip(2, m ...)`). */
  drawing?: string;
  scale?: number;
}

/** Line-level tags, resolved with libass precedence (see `mergeLineTags`). */
export interface LineTags {
  pos?: [number, number];
  /** x1,y1,x2,y2[,t1,t2] */
  move?: number[];
  org?: [number, number];
  /** `null`: the first `\an` was invalid, so the style alignment stays and later `\an` tags are ignored. */
  an?: number | null;
  /** `null`: the last `\q` was invalid (script WrapStyle). */
  q?: number | null;
  fad?: [number, number];
  /** a1,a2,a3,t1,t2,t3,t4 */
  fade?: number[];
  /** Rect `\clip`/`\iclip`: the LAST one wins (libass). */
  clip?: ClipSpec;
  /** Vector `\clip`/`\iclip`: the FIRST one wins, and it applies together with a rect clip (libass). */
  vclip?: ClipSpec;
}

export type KaraokeType = 'k' | 'kf' | 'ko';

/** A karaoke syllable slice; ms, relative to line start. */
export interface KaraokeSpan {
  type: KaraokeType;
  start: number;
  duration: number;
  /** Index of the syllable this fragment belongs to (fragments of one syllable share it). */
  syllable: number;
}

export type DrawCmd = 'm' | 'n' | 'l' | 'b' | 's' | 'p' | 'c';
export interface DrawCommand {
  cmd: DrawCmd;
  pts: Array<[number, number]>;
}

export interface Fragment {
  /** Display text: `\N` => "\n", `\h` => NBSP, `\n` => SOFT_BREAK. Empty for drawings. */
  text: string;
  /** Ordered state operations from the override blocks directly before this text. */
  ops: StateOp[];
  /** `\p` level (0 = text). */
  drawingScale: number;
  drawing?: DrawCommand[];
  karaoke?: KaraokeSpan;
}

/** Soft line break (`\n`): a break only with wrap style 2, otherwise a space. */
export const SOFT_BREAK = ' ';

export interface AssEvent {
  /** Deterministic: `"<index>"` where index is the position among all Dialogue lines in file order. */
  id: string;
  /** Position among Dialogue lines (file order, Comment lines excluded). */
  index: number;
  layer: number;
  /** Seconds. */
  start: number;
  end: number;
  style: string;
  name: string;
  /** Event margins; 0 means "use the style margin". */
  marginL: number;
  marginR: number;
  marginV: number;
  effect: string;
  /** Raw text field. */
  text: string;
  fragments: Fragment[];
  lineTags: LineTags;
  /** Unknown override tags, raw, in order (diagnostics). */
  unknownTags: string[];
}

export interface ParsedScript {
  info: ScriptInfo;
  styles: Map<string, AssStyle>;
  events: AssEvent[];
  /** Non-fatal parse problems (line numbers are 1-based). */
  warnings: string[];
}
