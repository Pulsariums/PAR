import { takesPartInStacking } from '../layout/Stacking';
import { findStyle } from '../parser/StyleParser';
import type { AssEvent, AssStyle, ScriptInfo, Transition } from '../types/script';

import { isPlated } from './plated';
import { foldOps, stateFromStyle, type TextState } from './State';

/** An event with everything that does not depend on time or screen size resolved once. */
export interface PreparedLine {
  event: AssEvent;
  style: AssStyle;
  durationMs: number;
  /** Numpad alignment after `\an`/`\a`. */
  an: number;
  /** Effective wrap style (`\q` or script WrapStyle). */
  wrapStyle: number;
  /** Effective margins (event margins override style margins when non-zero). */
  margins: { l: number; r: number; v: number };
  positioned: boolean;
  /** Takes part in collision stacking (see `layout/Stacking.ts`). */
  stacks: boolean;
  /** `Kerning: yes` in the script header; libass shapes without kerning by default. */
  kerning: boolean;
  /** Needs shadow/outline/fill plates (blur or translucent fill with a border), see `anim/plated.ts`. */
  plated: boolean;
  /** True when anything changes over time (`\t`, `\move`, `\fad`, `\fade`, karaoke). */
  animated: boolean;
  /** `\t(...\clip(x1,y1,x2,y2)...)` transitions from all fragments, in order. */
  clipTransitions: Transition[];
  /** Whole script area: where `\t(\clip)` starts when the line has no rect clip. */
  fullRect: [number, number, number, number];
}

export const prepareLine = (ev: AssEvent, styles: Map<string, AssStyle>, info: ScriptInfo): PreparedLine => {
  const style = findStyle(styles, ev.style);
  const lt = ev.lineTags;
  const transitions = ev.fragments.flatMap((f) => f.ops.filter((o): o is Transition => o.type === 't'));
  const animated = transitions.length > 0 || !!lt.move || !!lt.fad || !!lt.fade || ev.fragments.some((f) => !!f.karaoke);
  return {
    event: ev,
    style,
    durationMs: Math.max(0, Math.round((ev.end - ev.start) * 1000)),
    an: lt.an ?? style.alignment,
    wrapStyle: lt.q ?? info.wrapStyle,
    margins: {
      l: ev.marginL || style.marginL,
      r: ev.marginR || style.marginR,
      v: ev.marginV || style.marginV,
    },
    positioned: !!(lt.pos || lt.move),
    kerning: info.kerning,
    stacks: takesPartInStacking(lt, transitions.length > 0),
    plated: isPlated(ev, style, styles),
    animated,
    clipTransitions: transitions.filter((t) => !!t.clip),
    fullRect: [0, 0, info.playResX, info.playResY],
  };
};

/**
 * Text state of every fragment at `t` ms since line start: the ordered ops of fragments
 * 0..N folded over the line style (libass evaluates tags sequentially, so order matters).
 */
export const evalStates = (line: PreparedLine, t: number, styles: Map<string, AssStyle>): TextState[] => {
  const env = {
    t,
    durationMs: line.durationMs,
    // `\r<unknown>` falls back to the line style (libass `lookup_style_strict`).
    resetStyle: (name: string | null) => (name === null ? line.style : styles.get(name) ?? line.style),
  };
  const out: TextState[] = [];
  let st = stateFromStyle(line.style);
  for (const frag of line.event.fragments) {
    st = foldOps(st, frag.ops, env);
    out.push({ ...st });
  }
  return out;
};
