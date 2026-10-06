import { ev, preset } from './ass';

/** Presets about colour, borders, shadows and blur. */

export const color = preset('color', 'Colours and alpha', [
  ev(0, 8, '{\\an5\\pos(640,100)\\c&H0000FF&}\\c red {\\1c&H00FF00&}\\1c green {\\c&HFF0000&}blue'),
  ev(0, 8, '{\\an5\\pos(640,220)\\3c&H00FFFF&\\bord6}\\3c yellow outline'),
  ev(0, 8, '{\\an5\\pos(640,340)\\4c&H0000FF&\\shad8}\\4c red shadow'),
  ev(0, 8, '{\\an5\\pos(640,460)\\1a&H80&}\\1a 50% fill {\\1a&H00&\\3a&HA0&\\bord8}\\3a faint outline'),
  ev(0, 8, '{\\an5\\pos(640,580)\\alpha&H60&}\\alpha 38% {\\alpha&H00&\\t(0,4000,\\1c&H0000FF&\\alpha&HFF&)}animated colour and alpha'),
]);

export const blur = preset('blur', '\\blur \\be', [
  ev(0, 8, '{\\an5\\pos(640,100)\\blur0}blur 0'),
  ev(0, 8, '{\\an5\\pos(640,220)\\blur2}blur 2'),
  ev(0, 8, '{\\an5\\pos(640,340)\\blur6}blur 6'),
  ev(0, 8, '{\\an5\\pos(640,460)\\be1}be 1'),
  ev(0, 8, '{\\an5\\pos(640,580)\\be4\\t(0,4000,\\blur0)}be 4 fading to sharp via \\t(\\blur0)'),
]);

export const bord = preset('bord', '\\bord \\shad', [
  ev(0, 8, '{\\an5\\pos(320,120)\\bord0\\shad0}bord0 shad0'),
  ev(0, 8, '{\\an5\\pos(960,120)\\bord10\\shad0}bord10'),
  ev(0, 8, '{\\an5\\pos(320,260)\\bord2\\shad10}shad10'),
  ev(0, 8, '{\\an5\\pos(960,260)\\bord0\\shad0\\xshad10\\yshad-10}xshad10 yshad-10'),
  ev(0, 8, '{\\an5\\pos(320,400)\\xbord12\\ybord2}xbord12 ybord2 (approx.)'),
  ev(0, 8, '{\\an5\\pos(960,400)\\bord1\\t(0,4000,\\bord14)}animated bord'),
]);
