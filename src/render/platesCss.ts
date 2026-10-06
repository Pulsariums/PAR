import type { PlatePaint } from './plates';
import type { Css } from './textCss';

const px = (n: number): string => `${Math.round(n * 1000) / 1000}px`;

/** Inline-style paint of a text plate. Hidden plates keep their layout (`visibility`), so all plates wrap alike. */
export const plateTextCss = (p: PlatePaint, filter: string): Css => ({
  visibility: p.visible ? 'visible' : 'hidden',
  color: p.fill,
  '-webkit-text-stroke-width': px(p.strokeWidth),
  '-webkit-text-stroke-color': p.stroke,
  'paint-order': 'stroke fill',
  'text-shadow': 'none',
  'background-color': 'transparent',
  padding: '0px',
  'box-shadow': 'none',
  position: 'relative',
  left: px(p.dx),
  top: px(p.dy),
  filter,
});
