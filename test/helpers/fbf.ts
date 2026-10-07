import { evalStates, prepareLine } from '../../src/anim/Prepared';
import { positionAt } from '../../src/anim/LineAnim';
import { frameMs, frameRate } from '../../src/core/time';
import { parseScript } from '../../src/parser/ScriptParser';

export const HEAD = '[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,5,10,10,10,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';

const cs = (n: number): string => {
  const h = Math.floor(n / 360000), m = Math.floor(n / 6000) % 60, s = Math.floor(n / 100) % 60, c = n % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
};

/**
 * Where an exporter writes the start of the event for frame `k` (events are contiguous: each ends where the next starts). `mid` is what
 * Aegisub does: halfway between the previous frame and this one, so centisecond rounding stays inside the frame. `round` rounds the
 * frame's own time: half of the events then contain no frame instant at all.
 */
export const frameCs = (k: number, fps = 24, how: 'mid' | 'round' = 'mid'): number =>
  how === 'round' ? Math.round((k * 100) / fps) : k === 0 ? 0 : Math.floor((((k - 1) * 1000) / fps + (k * 1000) / fps) / 2 / 10);

export interface Track {
  frames: number;
  /** First video frame the track starts on. */
  from?: number;
  layer?: number;
  text?: string;
  /** Tags of frame `k` (without braces). */
  tags(k: number): string;
  fps?: number;
  how?: 'mid' | 'round';
}

/** One Dialogue line per frame of the track. */
export const fbfLines = (t: Track): string[] => {
  const fps = t.fps ?? 24;
  const from = t.from ?? 0;
  return Array.from({ length: t.frames }, (_, i) => {
    const k = from + i;
    return `Dialogue: ${t.layer ?? 0},${cs(frameCs(k, fps))},${cs(frameCs(k + 1, fps))},Default,,0,0,0,,{${t.tags(i)}}${t.text ?? 'A'}`;
  });
};

export const script = (lines: string[], eol = '\n'): string => (HEAD + lines.join('\n') + '\n').replace(/\n/g, eol);

export interface Shown { layer: number; order: number; text: string; pos: [number, number] | null; st: Record<string, number> }

/** What is on screen at each video frame, in drawing order: for comparing a script with its optimised version. */
export const dump = (text: string, fps: number, frames: number): Shown[][] => {
  const sc = parseScript(text);
  const lines = sc.events.map((e) => prepareLine(e, sc.styles, sc.info));
  const rate = frameRate(fps);
  const out: Shown[][] = [];
  for (let k = 0; k < frames; k++) {
    const t = frameMs(k, rate);
    const vis = lines.filter((l) => Math.round(l.event.start * 1000) <= t && t < Math.round(l.event.end * 1000)).sort((a, b) => a.event.layer - b.event.layer || a.event.index - b.event.index);
    out.push(vis.map((l, i) => {
      const rel = t - Math.round(l.event.start * 1000);
      const s = evalStates(l, rel, sc.styles)[0];
      const st: Record<string, number> = {};
      for (const key of ['fs', 'fscx', 'fscy', 'fsp', 'frx', 'fry', 'frz', 'fax', 'fay', 'xbord', 'ybord', 'xshad', 'yshad', 'blur', 'be', 'c1', 'c2', 'c3', 'c4', 'a1', 'a2', 'a3', 'a4'] as const) st[key] = s[key] as number;
      return { layer: l.event.layer, order: i, text: l.event.text.replace(/^\{[^}]*\}/, ''), pos: positionAt(l.event.lineTags, rel, l.durationMs), st };
    }));
  }
  return out;
};
