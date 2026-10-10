import { describe, expect, it } from 'vitest';

import { evalStates, prepareLine } from '../src/anim/Prepared';
import { cachedStates, lineSig, resetStates } from '../src/canvas/states';
import { parseScript } from '../src/parser/ScriptParser';

const HEAD = '[Script Info]\nPlayResX: 640\nPlayResY: 360\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';

const lines = (...texts: string[]) => {
  const sc = parseScript(HEAD + texts.map((t) => `Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,${t}\n`).join(''));
  return { sc, ls: sc.events.map((e) => prepareLine(e, sc.styles, sc.info)) };
};

describe('canvas state cache key', () => {
  it('does not let a \\fn value forge op boundaries', () => {
    const { sc, ls: [forged, real] } = lines('{\\fnA,sfs:5}x', '{\\fnA\\fs5}x');
    expect(lineSig(forged)).not.toBe(lineSig(real));
    resetStates();
    const a = cachedStates(forged, 500, sc.styles);
    const b = cachedStates(real, 500, sc.styles);
    expect(b).not.toBe(a);
    expect(a).toEqual(evalStates(forged, 500, sc.styles));
    expect(b).toEqual(evalStates(real, 500, sc.styles));
  });

  it('still shares one key and entry between identical lines', () => {
    const { sc, ls: [a, b] } = lines('{\\fnA,sfs:5\\fs5}x', '{\\fnA,sfs:5\\fs5}x');
    expect(lineSig(a)).toBe(lineSig(b));
    resetStates();
    expect(cachedStates(b, 500, sc.styles)).toBe(cachedStates(a, 500, sc.styles));
  });
});
