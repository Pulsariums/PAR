import type { Size } from './Layout';

/** Horizontal fraction of the text box at the anchor: 0 left, 0.5 centre, 1 right. */
export const alignX = (an: number): number => ((an - 1) % 3) / 2;

/** Vertical fraction of the text box at the anchor: 0 top, 0.5 middle, 1 bottom. */
export const alignY = (an: number): number => (an >= 7 ? 0 : an >= 4 ? 0.5 : 1);

export interface Margins {
  l: number;
  r: number;
  v: number;
}

/** Anchor point of an unpositioned line in layout coordinates (libass margin rules). */
export const marginAnchor = (an: number, m: Margins, size: Size): [number, number] => {
  const ax = alignX(an);
  const x = ax === 0 ? m.l : ax === 1 ? size.width - m.r : m.l + (size.width - m.l - m.r) / 2;
  const ay = alignY(an);
  const y = ay === 0 ? m.v : ay === 1 ? size.height - m.v : size.height / 2;
  return [x, y];
};

/** Maximum text width before wrapping (libass: PlayResX minus horizontal margins). */
export const maxTextWidth = (m: Margins, size: Size): number => Math.max(1, size.width - m.l - m.r);
