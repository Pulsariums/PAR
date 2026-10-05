/** Built-in sample so the demo shows something before any file is loaded. */
export const SAMPLE_ASS = String.raw`[Script Info]
Title: PAR demo
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,2,40,40,36,1
Style: Top,Georgia,36,&H00E0F0FF,&H000000FF,&H00402010,&H00000000,0,1,0,0,100,100,0,0,1,2,0,8,40,40,30,1
Style: Kara,Arial,54,&H0000E5FF,&H00FFFFFF,&H00202020,&H00000000,-1,0,0,0,100,100,2,0,1,3,0,8,40,40,90,1
Style: Box,Verdana,30,&H00FFFFFF,&H000000FF,&HA0000000,&H00000000,0,0,0,0,100,100,0,0,3,6,0,1,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:30.00,Top,,0,0,0,,PAR - Pulsar ASS Renderer\Nsample script (load your own files above)
Dialogue: 0,0:00:00.50,0:00:05.00,Default,,0,0,0,,{\fad(400,400)}Plain dialogue with a fade,\Nborder and shadow.
Dialogue: 0,0:00:03.00,0:00:06.00,Default,,0,0,0,,A second line stacks above the first.
Comment: 0,0:00:00.00,0:00:30.00,Default,,0,0,0,,This comment is never rendered.
Dialogue: 0,0:00:05.00,0:00:10.00,Default,,0,0,0,,{\move(200,400,1080,400)\t(\frz360)}\move + \t(\frz)
Dialogue: 0,0:00:05.00,0:00:10.00,Default,,0,0,0,,{\pos(640,600)\t(0,2500,\fs80\1c&H0000FF&)\t(2500,5000,\fs40\1c&HFF8000&)}\t colour + size
Dialogue: 0,0:00:10.00,0:00:16.00,Kara,,0,0,0,,{\k50}ka{\k50}ra{\kf80}o{\kf80}ke {\ko60}ef{\ko60}fect
Dialogue: 0,0:00:10.00,0:00:16.00,Default,,0,0,0,,{\pos(640,420)\clip(0,0,640,720)}Rect \clip: left half only
Dialogue: 0,0:00:16.00,0:00:22.00,Default,,0,0,0,,{\an7\pos(100,120)\p1\1c&H3060FF&\bord2}m 0 0 l 200 0 200 120 0 120 m 40 20 b 80 0 160 0 180 60
Dialogue: 0,0:00:16.00,0:00:22.00,Default,,0,0,0,,{\pos(640,360)\frx30\fry20\org(640,360)}3D rotation (\frx \fry)
Dialogue: 0,0:00:16.00,0:00:22.00,Box,,0,0,0,,BorderStyle 3 (opaque box)
Dialogue: 0,0:00:22.00,0:00:30.00,Default,,0,0,0,,{\pos(640,360)\fax0.3\fscx150\fsp6}Shear, x-scale, spacing
Dialogue: 0,0:00:22.00,0:00:30.00,Default,,0,0,0,,{\pos(640,500)\iclip(m 500 470 l 780 470 780 520 500 520)\blur2}Vector \iclip + \blur
`;
