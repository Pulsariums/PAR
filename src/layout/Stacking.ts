import type { LineTags } from '../types/script';

import type { Box } from './Collision';

/**
 * libass collision rules (`detect_collisions` in ass_parse.c, `shift_direction` in ass_render.c):
 * a line takes part in stacking unless it has `\pos`, `\move`, `\org` or any `\t`. Such lines are never
 * shifted and do not push others. (Banner/Scroll effects are exempt in libass too; PAR has no such effect.)
 */
export const takesPartInStacking = (lt: LineTags, hasTransition: boolean): boolean =>
  !lt.pos && !lt.move && !lt.org && !hasTransition;

/** Direction a colliding line moves: bottom aligned (`\an1-3`) up, top (`\an7-9`) and middle (`\an4-6`) lines down. */
export const stackDirection = (an: number): -1 | 1 => (an <= 3 ? -1 : 1);

/** The collision rectangle includes the outline on every side (libass uses the bitmap box). */
export const inflate = (b: Box, by: number): Box =>
  by <= 0 ? b : { left: b.left - by, right: b.right + by, top: b.top - by, bottom: b.bottom + by };
