import { vi } from 'vitest';

import { prepareLine } from '../../src/anim/Prepared';
import type { CanvasPath } from '../../src/canvas/CanvasPath';
import type { Lines } from '../../src/canvas/warm/planner';
import { Timeline } from '../../src/core/Timeline';
import { parseScript } from '../../src/parser/ScriptParser';
import type { LineEnv } from '../../src/render/LineView';

const HEAD = '[Script Info]\nPlayResX: 640\nPlayResY: 360\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
const T = (ms: number): string => `0:00:${String(Math.floor(ms / 1000)).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 10)).padStart(2, '0')}`;
export const ev = (s: number, e: number, tags: string, text = 'K'): string => `Dialogue: 0,${T(s)},${T(e)},Default,,0,0,0,,{\\an5\\pos(10,10)${tags}}${text}\n`;

/** A script, a CanvasPath double (cache, prebuild, pending) and what the look-ahead needs from the scene. */
export const kit = (text: string, o: { mode?: string } = {}) => {
  const sc = parseScript(HEAD + text);
  const tl = new Timeline(sc.events.map((e) => prepareLine(e, sc.styles, sc.info)));
  const env = { layout: { width: 640, height: 360 }, styles: sc.styles, borderScale: 1, blurScale: 1, devScale: 1, frameMs: 1000 / 24, fonts: { resolve: () => ({ family: 'Arial', weight: 400, italic: false, ratio: 1 }) } } as unknown as LineEnv;
  const cache = new Map<string, unknown>();
  const built: string[] = [];
  const path = {
    enabled: true, load: null, mode: () => o.mode ?? 'canvas', busy: () => true,
    complexity: () => ({ eligible: true, reason: '', score: 4, animated: new Set(['blur']) }),
    cache: { peek: (k: string) => cache.get(k), put: (k: string, s: unknown) => { cache.set(k, s); return true; }, sweep: vi.fn(), capBytes: 96 << 20 },
    prebuild: (k: string) => { cache.set(k, {}); built.push(k); },
    pending: (() => null) as (k: string) => number | null,
  } as unknown as CanvasPath;
  const lines = (): Lines => ({ startingIn: (a, b) => tl.startingIn(a, b), visibleAt: (t) => tl.visibleAt(t), startMs: (l) => tl.startMs(l), covers: null });
  return { env, path, lines, cache, built };
};
