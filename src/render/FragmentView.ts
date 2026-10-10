import type { KaraokePhase } from '../anim/Karaoke';
import type { TextState } from '../anim/State';
import { drawingBounds } from '../parser/DrawingParser';
import type { Fragment } from '../types/script';

import { beFn, blurFilter, blurSigma } from './blur';
import { cssColor } from './color';
import { CssWriter, SVG_NS, span } from './dom';
import { displayText } from './displayText';
import { drawingToPath } from './drawingPath';
import { platePaint, type PlatePaint, type Role } from './plates';
import { plateTextCss } from './platesCss';
import { SvgFilter } from './svgFilter';
import { fontCss, paintCss, xRatio, type Css, type StyleEnv } from './textCss';

const EPS = 1e-4;
const px = (n: number): string => `${Math.round(n * 1000) / 1000}px`;

/**
 * DOM for one fragment in one plate (`role`, see `plates.ts`), built once. `apply()` writes only
 * changed properties. Text => `<span>` (plus a clipped overlay for `\kf`); drawing => `<span><svg><g><path>`.
 */
export class FragmentView {
  readonly el: HTMLSpanElement;
  private readonly w: CssWriter;
  private overlay: CssWriter | null = null;
  private svg: CssWriter | null = null;
  private g: CssWriter | null = null;
  private path: CssWriter | null = null;
  private readonly size: [number, number] = [0, 0];
  /** Drawing control-box min corner: the path is shifted by -origin so the ink fills the box, exactly as libass anchors it. */
  private readonly origin: [number, number] = [0, 0];
  private fxCarve: SvgFilter | null = null;
  private fxBlur: SvgFilter | null = null;

  /** `defs` creates the line's hidden SVG `<defs>` on first use (SVG filters live there). */
  constructor(private readonly frag: Fragment, wrapStyle: number, private readonly role: Role = 'all', private readonly defs?: () => SVGElement) {
    this.el = span('par-frag');
    this.w = new CssWriter(this.el);
    if (frag.drawingScale > 0) {
      this.buildDrawing(frag);
      return;
    }
    const text = displayText(frag.text, wrapStyle);
    this.el.textContent = text;
    if (frag.karaoke?.type === 'kf' && (role === 'all' || role === 'fill')) {
      const ov = span('par-kf');
      ov.textContent = text;
      ov.setAttribute('aria-hidden', 'true');
      ov.style.setProperty('position', 'absolute');
      ov.style.setProperty('left', '0');
      ov.style.setProperty('top', '0');
      ov.style.setProperty('white-space', 'inherit');
      this.el.appendChild(ov);
      this.overlay = new CssWriter(ov);
    }
  }

  private buildDrawing(frag: Fragment): void {
    const svg = document.createElementNS(SVG_NS, 'svg');
    const g = document.createElementNS(SVG_NS, 'g');
    const path = document.createElementNS(SVG_NS, 'path');
    const cmds = frag.drawing ?? [];
    path.setAttribute('d', drawingToPath(cmds) || 'M 0 0');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('paint-order', 'stroke');
    svg.style.setProperty('overflow', 'visible');
    svg.style.setProperty('display', 'inline-block');
    g.appendChild(path);
    svg.appendChild(g);
    this.el.appendChild(svg);
    const b = drawingBounds(cmds);
    // libass anchors a drawing by its control-point bounding box: the box's own rectangle is the ink extent, so the path is shifted by
    // the box's min corner (see `origin` / `applyDrawing`) to sit inside it. Advance = control-box width, ascent = control-box height.
    if (b) {
      this.size.splice(0, 2, Math.max(0, b[2] - b[0]), Math.max(0, b[3] - b[1]));
      this.origin.splice(0, 2, b[0], b[1]);
    }
    this.svg = new CssWriter(svg);
    this.g = new CssWriter(g);
    this.path = new CssWriter(path);
    this.w.set({ 'font-size': '0px', 'line-height': '0px' });
  }

  /** `base` is the state the line-level transform was built from (first fragment). */
  apply(st: TextState, phase: KaraokePhase | null, env: StyleEnv, base: TextState): void {
    if (this.svg) this.applyDrawing(st, phase, env);
    else this.applyText(st, phase, env);
    this.applyLocalTransform(st, base);
  }

  /** Plated roles other than the fill plate are hidden under BorderStyle 3 (box and text are one bitmap). */
  private plated(st: TextState): boolean {
    return this.role !== 'all' && st.style.borderStyle !== 3;
  }

  private paint(st: TextState, phase: KaraokePhase | null, env: StyleEnv, kf: boolean): PlatePaint | null {
    if (!this.plated(st) || this.role === 'all') return null;
    return platePaint(this.role, st, phase, env, kf);
  }

  /**
   * Filter of this fragment. Any `\blur` goes through the SVG filter (see `svgFilter.ts`) when the line can host a `<defs>`: the SVG
   * filter pins `color-interpolation-filters: sRGB`, so DOM, the anisotropic/stretch case and the canvas path (`ctx.filter` blur is
   * sRGB too) all blur in the same colour space instead of the CSS `blur()` default. Carving the glyph out of a translucent-fill
   * plate and anisotropic blur (stretched text) also need the SVG filter. Without a `<defs>` host there is nowhere to put the filter,
   * so the fragment falls back to the CSS chain. `\be` stays CSS (it is in device pixels, not a layout-unit gaussian).
   */
  private filterOf(st: TextState, blur: number, be: number, carve: string | null, env: StyleEnv): string {
    const bsc = env.blurScale ?? 1;
    const s = blurSigma(blur, bsc);
    const ratio = xRatio(st);
    const aniso = s > 0 && ratio > 0 && Math.abs(ratio - 1) > 1e-3;
    if (this.defs && (carve !== null || s > 0)) {
      const fx = carve !== null
        ? (this.fxCarve ??= new SvgFilter(this.defs(), true))
        : (this.fxBlur ??= new SvgFilter(this.defs(), false));
      fx.set(aniso ? s / ratio : s, s, carve ?? undefined);
      return [`url(#${fx.id})`, ...beFn(be)].join(' ');
    }
    return blurFilter(blur, be, bsc);
  }

  private applyText(st: TextState, phase: KaraokePhase | null, env: StyleEnv): void {
    const kf = this.overlay !== null && phase !== null;
    const p = this.paint(st, phase, env, kf);
    let css: Css;
    if (p) css = { ...fontCss(st, env), ...plateTextCss(p, this.filterOf(st, p.blur, p.be, p.carve, env)) };
    else if (this.role === 'all' || this.role === 'fill') {
      css = { ...fontCss(st, env), ...paintCss(st, phase, env, kf) };
      css.filter = this.filterOf(st, st.blur, st.be, null, env);
    }
    else css = { ...fontCss(st, env), visibility: 'hidden' };
    if (kf) css.position = 'relative';
    this.w.set(css);
    if (this.overlay && phase) {
      this.overlay.set({
        color: cssColor(st.c1, st.a1),
        '-webkit-text-stroke-width': '0px',
        'text-shadow': 'none',
        padding: css.padding ?? '0px',
        'text-decoration-line': css['text-decoration-line'],
        'clip-path': `inset(0 ${Math.round((1 - phase.fill) * 10000) / 100}% 0 0)`,
      });
    }
  }

  private applyDrawing(st: TextState, phase: KaraokePhase | null, env: StyleEnv): void {
    const s = st.fscy / 100 / Math.pow(2, this.frag.drawingScale - 1);
    const bs = env.borderScale;
    const bord = Math.max(st.xbord, st.ybord) * bs;
    const p = this.paint(st, phase, env, false);
    const primary = phase === null || phase.fill >= 1;
    const filters: string[] = [];
    if (p) {
      filters.push(this.filterOf(st, p.blur, p.be, p.carve, env));
    } else {
      if (st.xshad !== 0 || st.yshad !== 0) {
        filters.push(`drop-shadow(${px(st.xshad * bs)} ${px(st.yshad * bs)} 0 ${cssColor(st.c4, st.a4)})`);
      }
      filters.push(this.filterOf(st, st.blur, st.be, null, env));
    }
    this.svg!.set({
      width: px(this.size[0] * s),
      height: px(this.size[1] * s),
      'vertical-align': px(-st.pbo * s),
      filter: filters.filter((f) => f !== 'none').join(' ') || 'none',
    });
    this.g!.attr('transform', `scale(${Math.round(s * 1e5) / 1e5}) translate(${Math.round(-this.origin[0] * 1000) / 1000} ${Math.round(-this.origin[1] * 1000) / 1000})`);
    if (p) {
      this.w.set({ visibility: p.visible ? 'visible' : 'hidden', position: 'relative', left: px(p.dx), top: px(p.dy) });
      const w = s > 0 ? p.strokeWidth / s : 0;
      this.path!.attr('fill', p.fill);
      this.path!.attr('stroke', w > 0 ? p.stroke : 'none');
      this.path!.attr('stroke-width', String(Math.round(w * 1000) / 1000));
      return;
    }
    this.path!.attr('fill', primary ? cssColor(st.c1, st.a1) : cssColor(st.c2, st.a2));
    const outline = bord > 0 && s > 0 && (phase === null || phase.outline);
    this.path!.attr('stroke', outline ? cssColor(st.c3, st.a3) : 'none');
    this.path!.attr('stroke-width', outline ? String(Math.round(((bord * 2) / s) * 1000) / 1000) : '0');
  }

  /** Per-fragment deviation from the line transform: x-scale ratio and rotation deltas. */
  private applyLocalTransform(st: TextState, base: TextState): void {
    const r = xRatio(base) > 0 ? xRatio(st) / xRatio(base) : 1;
    const parts: string[] = [];
    const scaled = Math.abs(r - 1) > EPS;
    if (scaled) parts.push(`scaleX(${Math.round(r * 1e5) / 1e5})`);
    const dz = st.frz - base.frz;
    const dx = st.frx - base.frx;
    const dy = st.fry - base.fry;
    if (Math.abs(dy) > EPS) parts.push(`rotateY(${dy}deg)`);
    if (Math.abs(dx) > EPS) parts.push(`rotateX(${dx}deg)`);
    if (Math.abs(dz) > EPS) parts.push(`rotateZ(${-dz}deg)`);
    const block = parts.length > 0 || this.overlay !== null || this.svg !== null;
    this.w.set({
      display: block ? 'inline-block' : 'inline',
      transform: parts.join(' ') || 'none',
      'transform-origin': scaled ? '0 50%' : '50% 50%',
    });
    // A transform does not change layout width: compensate the advance of x-scaled fragments.
    this.w.prop('margin-right', scaled ? px(this.el.offsetWidth * (r - 1)) : '0px');
  }
}
