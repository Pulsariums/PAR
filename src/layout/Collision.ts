/** Axis-aligned box in layout coordinates. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Placed {
  layer: number;
  box: Box;
}

const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Vertical shift that keeps `box` clear of already placed boxes of the same layer
 * (libass-style collision handling for unpositioned lines). Lines already on screen keep their
 * place; the new line moves up (`dir = -1`, bottom aligned) or down (`dir = 1`, top aligned).
 */
export const collisionShift = (box: Box, layer: number, dir: -1 | 1, placed: Placed[]): number => {
  let shift = 0;
  const others = placed.filter((p) => p.layer === layer).map((p) => p.box);
  for (let guard = 0; guard <= others.length; guard++) {
    const cur: Box = { ...box, top: box.top + shift, bottom: box.bottom + shift };
    const hit = others.find((o) => overlaps(cur, o));
    if (!hit) return shift;
    shift = dir < 0 ? shift + (hit.top - cur.bottom) : shift + (hit.bottom - cur.top);
  }
  return shift;
};
