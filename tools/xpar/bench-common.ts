/** Shared helpers of the synthetic benchmark generators (deterministic, no Node APIs). */
export const rng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const cs = (v: number): string => {
  const c = Math.round(v * 100);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${Math.floor(c / 360000)}:${p(Math.floor(c / 6000) % 60)}:${p(Math.floor(c / 100) % 60)}.${p(c % 100)}`;
};

/** Aegisub-style frame timing: a frame line spans the midpoints to the neighbouring frames, so its sample time k/fps sits in the middle. */
export const frameStart = (k: number, fps: number): number => Math.max(0, (k - 0.5) / fps);

/** Number with at most `d` decimals, trailing zeros stripped (what Lua/JS script generators print). */
export const n = (v: number, d = 2): string => String(Number(v.toFixed(d)));

export const STYLE_FORMAT =
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding';

export const header = (title: string, extraStyles: string[] = []): string =>
  [
    '[Script Info]',
    `; Synthetic benchmark script (tools/xpar/gen-bench.ts): ${title}`,
    `Title: ${title}`,
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    'PlayResX: 1920',
    'PlayResY: 1080',
    '',
    '[Aegisub Project Garbage]',
    'Audio File: episode.mka',
    'Video File: episode.mkv',
    'Video Position: 0',
    '',
    '[V4+ Styles]',
    STYLE_FORMAT,
    'Style: Default,Arial,64,&H00FFFFFF,&H000000FF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,2.5,1,2,120,120,50,1',
    'Style: Sign,Verdana,52,&H00F0F0F0,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1',
    'Style: Particle,Arial,40,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1',
    'Style: Shape,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1',
    'Style: OP-Kara,Arial,70,&H00FFFFFF,&H0000FFFF,&H00402010,&H00000000,-1,0,0,0,100,100,2,0,1,3,0,2,60,60,80,1',
    ...extraStyles,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    '',
  ].join('\n');

export interface BenchProfile {
  id: string;
  title: string;
  fps: number;
  /** Duration in seconds when not overridden. */
  seconds: number;
  /** Yields the file as text pieces of roughly 64 KB. */
  generate(seconds: number, seed: number): Generator<string>;
}

/** Collects pieces of lines into ~64 KB strings. */
export class Batcher {
  private parts: string[] = [];
  private size = 0;
  push(line: string): string | null {
    this.parts.push(line);
    this.size += line.length + 1;
    if (this.size < 65536) return null;
    return this.take();
  }
  take(): string {
    const s = this.parts.join('\n') + '\n';
    this.parts = [];
    this.size = 0;
    return s;
  }
  get pending(): boolean {
    return this.parts.length > 0;
  }
}
