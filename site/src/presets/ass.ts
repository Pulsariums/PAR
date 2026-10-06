/** Tiny ASS builder shared by all presets (PlayRes 1280x720 so the 16:9 test card matches). */

export interface Preset {
  id: string;
  /** Short, language-neutral name (tag names). */
  title: string;
  ass: string;
}

export interface EventOpts {
  style?: string;
  layer?: number;
  ml?: number;
  mr?: number;
  mv?: number;
  effect?: string;
  comment?: boolean;
}

const STYLE_FMT =
  'Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding';

const STYLES = [
  'Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,2,40,40,36,1',
  'Top,Georgia,36,&H00E0F0FF,&H000000FF,&H00402010,&H00000000,0,1,0,0,100,100,0,0,1,2,0,8,40,40,30,1',
  'Kara,Arial,56,&H0000E5FF,&H00FFFFFF,&H00202020,&H00000000,-1,0,0,0,100,100,2,0,1,3,0,2,40,40,70,1',
  'Box,Verdana,34,&H00FFFFFF,&H000000FF,&H60402010,&H00000000,0,0,0,0,100,100,0,0,3,8,0,2,40,40,50,1',
  'Sign,Georgia,64,&H0040C0FF,&H000000FF,&H00200040,&H00000000,-1,0,0,0,100,100,0,0,1,4,0,5,0,0,0,1',
];

export const time = (s: number): string => {
  const cs = Math.round(s * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${h}:${pad(m)}:${pad(sec)}.${pad(cs % 100)}`;
};

/** One Dialogue (or Comment) line. */
export const ev = (start: number, end: number, text: string, o: EventOpts = {}): string =>
  `${o.comment ? 'Comment' : 'Dialogue'}: ${o.layer ?? 0},${time(start)},${time(end)},${o.style ?? 'Default'},,${o.ml ?? 0},${o.mr ?? 0},${o.mv ?? 0},${o.effect ?? ''},${text}`;

/** Full script: header + styles + the given event lines. `wrap` is the script WrapStyle. */
export const script = (events: string[], wrap = 0, title = 'PAR playground'): string =>
  [
    '[Script Info]',
    `Title: ${title}`,
    'ScriptType: v4.00+',
    'PlayResX: 1280',
    'PlayResY: 720',
    `WrapStyle: ${wrap}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    `Format: ${STYLE_FMT}`,
    ...STYLES.map((s) => `Style: ${s}`),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n');

/** Shorthand: a preset with a title and its event lines. */
export const preset = (id: string, title: string, events: string[], wrap = 0): Preset => ({
  id,
  title,
  ass: script(events, wrap, title),
});
