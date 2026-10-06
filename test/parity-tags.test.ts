import { describe, expect, it } from 'vitest';

import { evalStates, prepareLine } from '../src/anim/Prepared';
import { positionAt } from '../src/anim/LineAnim';
import { parseScript } from '../src/parser/ScriptParser';
import { findStyle } from '../src/parser/StyleParser';
import { parseText } from '../src/parser/TextParser';

const HEAD = '[Script Info]\nPlayResX: 640\nPlayResY: 360\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, Bold, Italic, ScaleX, ScaleY, Spacing, Alignment, MarginL, MarginR, MarginV\nStyle: Default,Arial,20,&H00FFFFFF,0,1,150,120,-10,2,10,10,10\n[Events]\n';
const prep = (text: string) => {
  const s = parseScript(`${HEAD}Dialogue: 0,0:00:00.00,0:00:10.00,Default,,0,0,0,,${text}`);
  return { s, line: prepareLine(s.events[0], s.styles, s.info) };
};
const st = (text: string) => { const { s, line } = prep(text); return evalStates(line, 0, s.styles)[0]; };
const lt = (t: string) => parseText(t).lineTags;

describe('small tag rules (libass)', () => {
  it('\\fsc resets both scales and leaves the font size alone', () => {
    const a = st('{\\fs40\\fscx300\\fscy300\\fsc}x');
    expect([a.fscx, a.fscy, a.fs]).toEqual([150, 120, 40]);
    const b = st('{\\fs40\\fscx300\\fsc50}x');
    expect([b.fscx, b.fscy, b.fs]).toEqual([150, 120, 40]);
  });

  it('\\move swaps reversed times', () => {
    const m = lt('{\\move(100,100,500,100,3000,1000)}x');
    expect(positionAt(m, 2000, 5000)).toEqual([300, 100]);
    expect(positionAt(lt('{\\move(0,0,100,0,0,0)}x'), 500, 1000)).toEqual([50, 0]);
  });

  it('an invalid first \\an takes the slot; the style alignment stays', () => {
    expect(lt('{\\an0\\an9}x').an).toBeNull();
    expect(lt('{\\an10\\an9}x').an).toBeNull();
    expect(lt('{\\an7\\an9}x').an).toBe(7);
    expect(prep('{\\an0\\an9}x').line.an).toBe(2);
  });

  it('\\a4 and \\a8 act like \\a5 (top left); \\a invalid is ignored', () => {
    expect(lt('{\\a4}x').an).toBe(7);
    expect(lt('{\\a8}x').an).toBe(7);
    expect(lt('{\\a5}x').an).toBe(7);
    expect(lt('{\\a2}x').an).toBe(2);
    expect(lt('{\\a99\\an6}x').an).toBe(6);
  });

  it('\\b accepts 0, 1 and >= 100 only', () => {
    expect([0, 1, 100, 700].map((v) => st(`{\\b${v}}x`).b)).toEqual([0, 1, 100, 700]);
    expect([2, 50, 99, -1].map((v) => st(`{\\b${v}}x`).b)).toEqual([0, 0, 0, 0]); // style value
  });

  it('\\i \\u \\s accept 0 and 1 only', () => {
    expect(st('{\\i0}x').i).toBe(false);
    expect(st('{\\i1}x').i).toBe(true);
    expect(st('{\\i2}x').i).toBe(true); // style italic is on: invalid reverts to the style
    expect(st('{\\i0\\i2}x').i).toBe(true);
    expect(st('{\\u3}x').u).toBe(false);
    expect(st('{\\s1}x').s).toBe(true);
    expect(st('{\\s5}x').s).toBe(false);
  });

  it('\\fn0 and an empty \\fn mean the style font', () => {
    expect(st('{\\fnImpact\\fn0}x').fn).toBe('Arial');
    expect(st('{\\fnImpact\\fn}x').fn).toBe('Arial');
    expect(st('{\\fnImpact}x').fn).toBe('Impact');
  });

  it('an invalid \\q means the script WrapStyle; the last \\q wins', () => {
    expect(lt('{\\q2\\q9}x').q).toBeNull();
    expect(prep('{\\q2\\q9}x').line.wrapStyle).toBe(0);
    expect(lt('{\\q9\\q1}x').q).toBe(1);
  });
});

describe('style rules (libass)', () => {
  it('a negative style Spacing is 0', () => {
    expect(prep('x').s.styles.get('Default')!.spacing).toBe(0);
    expect(st('{\\fsp-3}x').fsp).toBe(-3);
  });

  it('an unknown or missing Default style is the built-in Arial 18, not the first style', () => {
    const only = parseScript('[V4+ Styles]\nFormat: Name, Fontname, Fontsize\nStyle: Alt,Impact,120\n').styles;
    expect(findStyle(only, 'Alt').fontSize).toBe(120);
    expect(findStyle(only, 'Nope')).toMatchObject({ name: 'Default', fontName: 'Arial', fontSize: 18 });
    expect(findStyle(only, 'Default').fontSize).toBe(18);
  });

  it('a missing style name falls back to Default when the script has one', () => {
    const { s } = prep('x');
    expect(findStyle(s.styles, 'Missing').name).toBe('Default');
  });

  it('trailing CR, TAB and spaces of the Text field are dropped', () => {
    const s = parseScript(`${HEAD}Dialogue: 0,0:00:00.00,0:00:10.00,Default,,0,0,0,,abc \t \r`);
    expect(s.events[0].text).toBe('abc');
    expect(s.events[0].fragments.map((f) => f.text)).toEqual(['abc']);
  });
});
