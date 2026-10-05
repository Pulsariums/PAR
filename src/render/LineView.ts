import { karaokePhase } from '../anim/Karaoke';
import { clipAt, fadeAlphaAt, positionAt } from '../anim/LineAnim';
import { evalStates, type PreparedLine } from '../anim/Prepared';
import { stateFromStyle, type TextState } from '../anim/State';
import { alignX, alignY, marginAnchor, maxTextWidth } from '../layout/Anchor';
import type { Box } from '../layout/Collision';
import type { Size } from '../layout/Layout';
import type { AssStyle } from '../types/script';

import { clipPathCss } from './clipCss';
import { CssWriter, div } from './dom';
import { FragmentView } from './FragmentView';
import { xRatio, type StyleEnv } from './textCss';

/** libass/VSFilter perspective distance for `\frx`/`\fry`, in layout pixels. */
export const PERSPECTIVE = 312.5;

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

export interface LineEnv extends StyleEnv {
  layout: Size;
  styles: Map<string, AssStyle>;
}

/** Line rotation around the origin (`\org`, default: anchor), as CSS. Identity => 'none'. */
export const lineTransformCss = (st: TextState): string => {
  const parts: string[] = [];
  if (st.frx !== 0 || st.fry !== 0) parts.push(`perspective(${PERSPECTIVE}px)`);
  if (st.fry !== 0) parts.push(`rotateY(${r3(st.fry)}deg)`);
  if (st.frx !== 0) parts.push(`rotateX(${r3(st.frx)}deg)`);
  if (st.frz !== 0) parts.push(`rotateZ(${r3(-st.frz)}deg)`);
  return parts.join(' ') || 'none';
};

const deg = (ratio: number): number => r3((Math.atan(ratio) * 180) / Math.PI);

/**
 * Text box transform: anchor alignment, x-scale (`\fscx`/`\fscy`) and shear (`\fax`/`\fay`,
 * x' = x + fax*y, y' = y + fay*x, pivot at the box top-left like VSFilter/libass). skewX/skewY are
 * used for the single-axis case: Chromium mis-renders matrix() shear on letter-spaced text.
 */
export const boxTransformCss = (an: number, rx: number, fax: number, fay: number): string => {
  const ax = alignX(an) * 100;
  const ay = alignY(an) * 100;
  let t = `translate(${-ax}%, ${-ay}%) scaleX(${r3(rx)})`;
  if (fax === 0 && fay === 0) return t;
  const shear = fay === 0 ? `skewX(${deg(fax)}deg)` : fax === 0 ? `skewY(${deg(fay)}deg)` : `matrix(1, ${r3(fay)}, ${r3(fax)}, 1, 0, 0)`;
  t += ` translate(${-ax}%, ${-ay}%) ${shear} translate(${ax}%, ${ay}%)`;
  return t;
};

/**
 * DOM of one visible event, built once when it becomes visible:
 * root (clip, fade, z-order) > layer (rotation/shear around the origin) > box (anchor, x-scale, wrap) > fragments.
 */
export class LineView {
  readonly root: HTMLDivElement;
  private readonly layer: CssWriter;
  private readonly box: CssWriter;
  private readonly rootW: CssWriter;
  private readonly frags: FragmentView[];
  private staticClip: string | null = null;
  private applied = false;
  private rx = 1;
  /** Collision shift in layout px (unpositioned lines only). */
  shiftY = 0;

  constructor(readonly line: PreparedLine) {
    const abs = { position: 'absolute', left: '0px', top: '0px', width: '0px', height: '0px' };
    this.root = div('par-line', abs);
    this.root.dataset.parId = line.event.id;
    this.root.style.setProperty('z-index', String(line.event.layer));
    const layerEl = div('par-layer', abs);
    const ax = alignX(line.an);
    const ay = alignY(line.an);
    const boxEl = div('par-box', {
      position: 'absolute',
      width: 'max-content',
      'font-size': '0px',
      'line-height': '0px',
      'white-space': line.wrapStyle === 2 ? 'pre' : 'pre-wrap',
      'overflow-wrap': 'break-word',
      'text-wrap': line.wrapStyle === 0 || line.wrapStyle === 3 ? 'balance' : 'wrap',
      'text-align': ax === 0 ? 'left' : ax === 1 ? 'right' : 'center',
      'transform-origin': `${ax * 100}% ${ay * 100}%`,
    });
    this.frags = line.event.fragments.map((f) => new FragmentView(f, line.wrapStyle));
    for (const f of this.frags) boxEl.appendChild(f.el);
    layerEl.appendChild(boxEl);
    this.root.appendChild(layerEl);
    this.rootW = new CssWriter(this.root);
    this.layer = new CssWriter(layerEl);
    this.box = new CssWriter(boxEl);
  }

  /** True when this line must be updated every frame. */
  get animated(): boolean {
    return this.line.animated;
  }

  /** Updates the DOM for `t` ms since line start. Static lines skip work unless `force`. */
  update(t: number, env: LineEnv, force = false): void {
    if (this.applied && !force && !this.line.animated) return;
    this.applied = true;
    const { line } = this;
    const states = evalStates(line, t, env.styles);
    const base = states[0] ?? stateFromStyle(line.style);
    this.frags.forEach((f, i) => {
      const k = line.event.fragments[i].karaoke;
      f.apply(states[i], k ? karaokePhase(k, t) : null, env, base);
    });
    const anchor = this.anchorAt(t, env.layout);
    const rx = xRatio(base);
    this.rx = rx;
    this.box.set({
      left: `${r3(anchor[0])}px`,
      top: `${r3(anchor[1])}px`,
      'max-width': `${r3(maxTextWidth(line.margins, env.layout) / (rx > 0 ? rx : 1))}px`,
      transform: boxTransformCss(line.an, rx, base.fax, base.fay),
    });
    const org = line.event.lineTags.org ?? anchor;
    this.layer.set({
      'transform-origin': `${r3(org[0])}px ${r3(org[1])}px`,
      transform: lineTransformCss(base),
    });
    this.rootW.prop('clip-path', this.clipCss(t));
    const fade = fadeAlphaAt(line.event.lineTags, t, line.durationMs);
    this.rootW.prop('opacity', String(r3(1 - fade / 255)));
  }

  private clipCss(t: number): string {
    const { line } = this;
    if (line.clipTransitions.length === 0) {
      if (this.staticClip === null) this.staticClip = clipPathCss(line.event.lineTags.clip);
      return this.staticClip;
    }
    return clipPathCss(clipAt(line.event.lineTags.clip, line.clipTransitions, t, line.durationMs));
  }

  /** Anchor point at `t`: `\pos`/`\move`, else margins + alignment + collision shift. */
  anchorAt(t: number, layout: Size): [number, number] {
    const p = positionAt(this.line.event.lineTags, t, this.line.durationMs);
    if (p) return p;
    const a = marginAnchor(this.line.an, this.line.margins, layout);
    return [a[0], a[1] + this.shiftY];
  }

  /** Measured box in layout px (uses layout reads; call once after the first update). */
  measure(layout: Size): Box {
    const el = this.box.el as HTMLElement;
    const w = el.offsetWidth * this.rx;
    const h = el.offsetHeight;
    const [x, y] = this.anchorAt(0, layout);
    const left = x - alignX(this.line.an) * w;
    const top = y - alignY(this.line.an) * h;
    return { left, top, right: left + w, bottom: top + h };
  }

  destroy(): void {
    this.root.remove();
  }
}
