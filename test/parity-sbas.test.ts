import { describe, expect, it } from 'vitest';

import { parseScript } from '../src/parser/ScriptParser';

const STD = 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding';
const CUSTOM = 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV';
const file = (info: string, fmt: string) => `[Script Info]\n${info}\n\n[V4+ Styles]\n${fmt}\nStyle: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1\n`;
const sbas = (info: string, fmt: string) => parseScript(file(info, fmt)).info.scaledBorderAndShadow;

describe('ScaledBorderAndShadow default (libass)', () => {
  it('missing header with the standard Format line is no', () => {
    expect(sbas('PlayResX: 640', STD)).toBe(false);
  });
  it('missing header with a custom Format line is yes (libass compat rule)', () => {
    expect(sbas('PlayResX: 640', CUSTOM)).toBe(true);
  });
  it('an explicit header always wins, also against a custom Format', () => {
    expect(sbas('ScaledBorderAndShadow: no', CUSTOM)).toBe(false);
    expect(sbas('ScaledBorderAndShadow: yes', STD)).toBe(true);
  });
  it('parses like libass parse_bool: "yes" prefix or number > 0', () => {
    expect(sbas('ScaledBorderAndShadow: Yes', STD)).toBe(true);
    expect(sbas('ScaledBorderAndShadow: 1', STD)).toBe(true);
    expect(sbas('ScaledBorderAndShadow: true', STD)).toBe(false);
    expect(sbas('ScaledBorderAndShadow: 0', STD)).toBe(false);
  });
  it('a script without any style section is no', () => {
    expect(parseScript('[Script Info]\nTitle: x\n').info.scaledBorderAndShadow).toBe(false);
  });
});

describe('blur scale base', () => {
  it('blur sigma follows the storage ratio like libass blur_scale', async () => {
    const { blurFn } = await import('../src/render/blur');
    expect(blurFn(2, 2 / 3)).toEqual(['blur(1.132px)']);
    expect(blurFn(2)).toEqual(['blur(1.699px)']);
  });
});
