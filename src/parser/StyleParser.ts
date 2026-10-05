import type { AssStyle } from '../types/script';

import { legacyToNumpad, parseStyleColour } from './TagValues';

export const V4P_STYLE_FORMAT = 'name,fontname,fontsize,primarycolour,secondarycolour,outlinecolour,backcolour,bold,italic,underline,strikeout,scalex,scaley,spacing,angle,borderstyle,outline,shadow,alignment,marginl,marginr,marginv,encoding'.split(',');
export const V4_STYLE_FORMAT = 'name,fontname,fontsize,primarycolour,secondarycolour,tertiarycolour,backcolour,bold,italic,borderstyle,outline,shadow,alignment,marginl,marginr,marginv,alphalevel,encoding'.split(',');

/** Built-in style used when a script defines none (close to libass' default). */
export const DEFAULT_STYLE: Readonly<AssStyle> = Object.freeze({
  name: 'Default', fontName: 'Arial', fontSize: 18,
  primaryColour: 0xffffff, secondaryColour: 0x0000ff, outlineColour: 0, backColour: 0,
  primaryAlpha: 0, secondaryAlpha: 0, outlineAlpha: 0, backAlpha: 0,
  bold: 0, italic: false, underline: false, strikeOut: false, scaleX: 100, scaleY: 100, spacing: 0, angle: 0,
  borderStyle: 1, outline: 2, shadow: 2, alignment: 2, marginL: 20, marginR: 20, marginV: 20, encoding: 1,
});

const num = (v: string | undefined, def: number): number => {
  if (v === undefined || v.trim() === '') return def;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : def;
};

/**
 * One style record => AssStyle. `fields` are the lower-cased Format names.
 * `legacy` = SSA v4 semantics (legacy alignment, TertiaryColour as outline colour).
 */
export const parseStyle = (fields: string[], values: string[], legacy: boolean): AssStyle => {
  const get = (k: string): string | undefined => {
    const i = fields.indexOf(k);
    return i === -1 ? undefined : values[i];
  };
  const colour = (k: string, defC: number, defA: number) => {
    const v = get(k);
    return (v !== undefined && parseStyleColour(v)) || { colour: defC, alpha: defA };
  };
  const d = DEFAULT_STYLE;
  const p = colour('primarycolour', d.primaryColour, 0);
  const s = colour('secondarycolour', d.secondaryColour, 0);
  const o = colour(get('outlinecolour') !== undefined ? 'outlinecolour' : 'tertiarycolour', d.outlineColour, 0);
  const b = colour('backcolour', d.backColour, 0);
  const rawAlign = num(get('alignment'), 2);
  const alignment = legacy ? legacyToNumpad(rawAlign) ?? 2 : rawAlign >= 1 && rawAlign <= 9 ? Math.round(rawAlign) : 2;
  const fontName = (get('fontname') ?? d.fontName).trim() || d.fontName;
  return {
    name: (get('name') ?? 'Default').trim().replace(/^\*+/, '') || 'Default',
    fontName,
    fontSize: num(get('fontsize'), d.fontSize),
    primaryColour: p.colour, secondaryColour: s.colour, outlineColour: o.colour, backColour: b.colour,
    primaryAlpha: p.alpha, secondaryAlpha: s.alpha, outlineAlpha: o.alpha, backAlpha: b.alpha,
    bold: num(get('bold'), 0),
    italic: num(get('italic'), 0) !== 0,
    underline: num(get('underline'), 0) !== 0,
    strikeOut: num(get('strikeout'), 0) !== 0,
    scaleX: Math.max(0, num(get('scalex'), 100)),
    scaleY: Math.max(0, num(get('scaley'), 100)),
    spacing: num(get('spacing'), 0),
    angle: num(get('angle'), 0),
    borderStyle: num(get('borderstyle'), 1),
    outline: Math.max(0, num(get('outline'), d.outline)),
    shadow: Math.max(0, num(get('shadow'), d.shadow)),
    alignment,
    marginL: num(get('marginl'), d.marginL),
    marginR: num(get('marginr'), d.marginR),
    marginV: num(get('marginv'), d.marginV),
    encoding: num(get('encoding'), 1),
  };
};

/** Style lookup with libass-like fallback: exact name, leading `*` stripped, "Default", first style. */
export const findStyle = (styles: Map<string, AssStyle>, name: string): AssStyle => {
  const n = name.trim().replace(/^\*+/, '');
  return styles.get(n) ?? styles.get('Default') ?? styles.values().next().value ?? DEFAULT_STYLE;
};
