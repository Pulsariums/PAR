/**
 * SRT and WebVTT are turned into ASS text, the one format PAR renders. Positioning and styling from the file are not kept
 * (basic <b>, <i>, <u> tags are); every cue is a plain bottom-centre line.
 */
const HEADER = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,64,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,1,2,80,80,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** "HH:MM:SS,mmm", "HH:MM:SS.mmm" or "MM:SS.mmm" to ASS time "H:MM:SS.cc". */
const assTime = (raw: string): string | null => {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/.exec(raw.trim());
  if (!m) return null;
  const total = Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  const cs = Math.round(Number(`0.${m[4]}`) * 100);
  const h = Math.floor(total / 3600);
  const mi = Math.floor((total % 3600) / 60);
  return `${h}:${pad2(mi)}:${pad2(total % 60)}.${pad2(cs === 100 ? 99 : cs)}`;
};

/** Cue text to ASS text: braces are escaped first, then basic tags become overrides and other markup is dropped. */
const cueText = (lines: string[]): string => {
  const body = lines
    .join('\n')
    .replace(/[{}]/g, (c) => (c === '{' ? '(' : ')'))
    .replace(/<\s*b\s*>/gi, '{\\b1}').replace(/<\s*\/\s*b\s*>/gi, '{\\b0}')
    .replace(/<\s*i\s*>/gi, '{\\i1}').replace(/<\s*\/\s*i\s*>/gi, '{\\i0}')
    .replace(/<\s*u\s*>/gi, '{\\u1}').replace(/<\s*\/\s*u\s*>/gi, '{\\u0}')
    .replace(/<[^>]*>/g, '');
  return body.replace(/\n/g, '\\N');
};

/** Converts an SRT or WebVTT text to ASS text. Returns null when no cue could be read. */
export const toAss = (text: string): string | null => {
  const blocks = text.replace(/\r/g, '').replace(/^\uFEFF/, '').split(/\n{2,}/);
  const events: string[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [a, b] = lines[at]!.split('-->');
    const start = assTime(a ?? '');
    const end = assTime((b ?? '').trim().split(/\s+/)[0] ?? '');
    if (!start || !end) continue;
    const body = cueText(lines.slice(at + 1));
    events.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${body}`);
  }
  return events.length ? HEADER + events.join('\n') + '\n' : null;
};

/** A File holding the ASS version of an SRT / VTT file (named .ass so the rest of the page treats it like one), or null. */
export const srtOrVttToAssFile = async (file: File): Promise<File | null> => {
  const ass = toAss(await file.text());
  if (!ass) return null;
  return new File([ass], file.name.replace(/\.(srt|vtt)$/i, '.ass'), { type: 'text/plain' });
};
