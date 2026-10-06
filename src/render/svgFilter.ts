import { SVG_NS } from './dom';

let seq = 0;
const RGBA = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/;

const el = (tag: string, attrs: Record<string, string>): SVGElement => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};

/**
 * Per-fragment SVG filter, for the two things CSS `blur()` cannot do:
 * - `carve`: cut the glyph out of a blurred outline/shadow plate, like libass `ass_fix_outline`.
 *   The plate is painted with marker colours (fill red over a blue stroke, see `plates.ts`): the red
 *   channel is the sharp glyph coverage, the alpha channel the silhouette. Result: blur(silhouette)
 *   minus glyph, recoloured. Needed when the fill is not fully opaque (an opaque fill hides the inner
 *   half of the stroke anyway, so plain CSS suffices there).
 * - anisotropic blur: libass blurs the final bitmap, so `\blur` is round on screen even when the text
 *   is stretched by `\fscx`/`\fscy`; CSS `blur()` runs before the stretch, SVG takes one sigma per axis.
 */
export class SvgFilter {
  readonly id: string;
  private readonly blur: SVGElement;
  private readonly flood: SVGElement | null = null;

  constructor(defs: SVGElement, carve: boolean) {
    this.id = `par-${carve ? 'carve' : 'blur'}-${++seq}`;
    const f = el('filter', { id: this.id, x: '-1', y: '-1', width: '3', height: '3', 'color-interpolation-filters': 'sRGB' });
    this.blur = el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '0.01', result: 'b' });
    if (carve) {
      f.appendChild(el('feColorMatrix', { in: 'SourceGraphic', type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0', result: 'g' }));
      f.appendChild(this.blur);
      f.appendChild(el('feComposite', { in: 'b', in2: 'g', operator: 'out', result: 'o' }));
      this.flood = el('feFlood', { 'flood-color': '#000', result: 'c' });
      f.appendChild(this.flood);
      f.appendChild(el('feComposite', { in: 'c', in2: 'o', operator: 'in' }));
    } else f.appendChild(this.blur);
    defs.appendChild(f);
  }

  /** Sigma per axis in layout units; `color` (carve only) is a CSS `rgba()` string. */
  set(sx: number, sy: number, color?: string): void {
    const r = (n: number): string => String(Math.max(0.01, Math.round(n * 1000) / 1000));
    this.blur.setAttribute('stdDeviation', sx === sy ? r(sx) : `${r(sx)} ${r(sy)}`);
    const m = color ? RGBA.exec(color) : null;
    if (!m || !this.flood) return;
    this.flood.setAttribute('flood-color', `rgb(${m[1]}, ${m[2]}, ${m[3]})`);
    this.flood.setAttribute('flood-opacity', m[4] ?? '1');
  }
}
