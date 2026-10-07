import { afterEach, describe, expect, it, vi } from 'vitest';

import { prepareLine } from '../src/anim/Prepared';
import type { CanvasPath } from '../src/canvas/CanvasPath';
import { newWarmState, warmUp } from '../src/canvas/warm';
import { parseScript } from '../src/parser/ScriptParser';
import type { LineEnv } from '../src/render/LineView';

const HEAD = '[Script Info]\nPlayResX: 640\nPlayResY: 360\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
const fonts = { resolve: () => ({ family: 'Arial', weight: 400, italic: false, ratio: 1 }) };

const make = () => {
  const text = (i: number) => `Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\an5\\pos(${10 + i},10)\\blur2\\t(0,900,\\fscx150\\fscy150\\blur6)}K${i}\n`;
  const sc = parseScript(HEAD + [0, 1, 2, 3].map(text).join(''));
  const lines = sc.events.map((e) => prepareLine(e, sc.styles, sc.info));
  const env = { layout: { width: 640, height: 360 }, styles: sc.styles, borderScale: 1, blurScale: 1, devScale: 1, fonts } as unknown as LineEnv;
  const built = new Map<string, number>();
  const path = {
    mode: () => 'canvas',
    busy: () => true,
    complexity: () => ({ eligible: true, reason: '', score: 4, animated: new Set(['blur', 'fs', 'fscx']) }),
    cache: { peek: (k: string) => (built.has(k) ? {} : undefined) },
    prebuild: (k: string) => { built.set(k, (built.get(k) ?? 0) + 1); },
  } as unknown as CanvasPath;
  return { lines, env, built, path };
};

afterEach(() => vi.restoreAllMocks());

describe('lookahead progress', () => {
  it('finishes in slices without building or planning a sample twice', () => {
    const { lines, env, built, path } = make();
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 1));
    const st = newWarmState();
    const startOf = () => 1000;
    let slices = 0;
    let more = true;
    while (more && slices < 200) {
      more = warmUp(path, lines, 0, env, 1000 / 24, 4, st, startOf).more;
      slices++;
    }
    expect(more).toBe(false);
    expect(slices).toBeGreaterThan(1); // the 4 ms budget cannot finish four animated events in one go
    expect(st.done.size).toBe(lines.length);
    expect(st.next.size).toBe(0);
    expect(built.size).toBeGreaterThan(lines.length);
    for (const n of built.values()) expect(n).toBe(1);
    // nothing left: the next call is free
    expect(warmUp(path, lines, 0, env, 1000 / 24, 4, st, startOf)).toEqual({ built: 0, more: false });
  });

  it('does nothing when the scene is not heavy and canvas is not forced', () => {
    const { lines, env, path } = make();
    const quiet = { ...path, mode: () => 'auto', busy: () => false, complexity: () => ({ eligible: true, reason: '', score: 1, animated: new Set<string>() }) } as unknown as CanvasPath;
    expect(warmUp(quiet, lines.slice(0, 1), 0, env, 41.7, 4, newWarmState(), () => 0)).toEqual({ built: 0, more: false });
  });
});
