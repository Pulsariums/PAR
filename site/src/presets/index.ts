import { collision, comments, fad, layers, an, basic, box, move, pos, wrap } from './layout';
import { karaoke, reset, t } from './anim';
import { clip, drawing, fsp, iclip, rot, scale, shear, vclip } from './geometry';
import { blur, bord, color } from './looks';
import { fontsEmbedded, fontsLibrary, fontsUser } from './fonts';
import { stress, unsupported } from './misc';
import { boundary } from './timing';
import type { Preset } from './ass';

export type { Preset };

/** Gallery order: one preset per feature. */
export const PRESETS: readonly Preset[] = [
  basic, pos, move, an, fad, t, rot, shear, scale, fsp, color, blur, bord, clip, iclip, vclip,
  karaoke, drawing, reset, wrap, box, layers, collision, comments, boundary, fontsEmbedded, fontsUser, fontsLibrary, stress, unsupported,
];

export const presetById = (id: string): Preset | undefined => PRESETS.find((p) => p.id === id);
