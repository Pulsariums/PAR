const STYLE_FORMAT = 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding';

export const style = (name: string, font: string, bold = 0, italic = 0): string =>
  `Style: ${name},${font},20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,${bold},${italic},0,0,100,100,0,0,1,2,0,2,10,10,10,1`;

export const dialogue = (styleName: string, text: string): string => `Dialogue: 0,0:00:00.00,0:00:05.00,${styleName},,0,0,0,,${text}`;

/** A complete script: `styles` are `style()` lines, `events` are `dialogue()` lines. */
export const ass = (styles: string[], events: string[], extra = ''): string => [
  '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 384', 'PlayResY: 288', '', '[V4+ Styles]', STYLE_FORMAT, ...styles, '', extra,
  '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text', ...events,
].join('\n');
