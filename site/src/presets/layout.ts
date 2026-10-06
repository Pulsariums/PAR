import { ev, preset } from './ass';

/** Presets about placement, alignment, wrapping, boxes, layers and collisions. */

export const basic = preset('basic', 'Styles, outline, shadow', [
  ev(0, 9, 'Default style: white, outline 3, shadow 2', { mv: 150 }),
  ev(0, 9, 'Top style: italic serif, thin outline', { style: 'Top' }),
  ev(0, 9, '{\\b0}regular {\\b1}bold {\\i1}bold italic {\\b0\\i0\\u1}underline {\\u0\\s1}strike{\\s0} {\\b700}b700 {\\b300}b300'),
]);

export const pos = preset('pos', '\\pos', [
  ev(0, 8, '{\\an5\\pos(200,140)}pos(200,140)'),
  ev(0, 8, '{\\an5\\pos(640,360)}pos(640,360) centre'),
  ev(0, 8, '{\\an5\\pos(1080,580)}pos(1080,580)'),
  ev(0, 8, '{\\an7\\pos(20,20)\\fs28}an7 at (20,20): top-left corner'),
  ev(0, 8, '{\\an5\\pos(900,180)\\pos(100,600)}first \\pos wins'),
]);

export const move = preset('move', '\\move', [
  ev(0, 8, '{\\an5\\move(100,200,1180,200)}move over the whole line'),
  ev(0, 8, '{\\an5\\move(640,330,640,640,1500,4500)}move(t1=1.5s, t2=4.5s)'),
  ev(0, 8, '{\\an4\\move(1180,120,100,120)\\fs36}right to left'),
]);

export const an = preset(
  'an',
  '\\an alignment grid',
  [7, 8, 9, 4, 5, 6, 1, 2, 3].map((n) => ev(0, 8, `{\\an${n}\\fs40}an${n}`, { ml: 30, mr: 30, mv: 30 })),
);

export const fad = preset('fad', '\\fad \\fade', [
  ev(0, 8, '{\\an5\\pos(640,200)\\fad(1500,1500)}fad(1500,1500)'),
  ev(0, 8, '{\\an5\\pos(640,360)\\fade(255,0,255,500,2000,5500,7000)}fade 7-arg: in, hold, out'),
  ev(0, 8, '{\\an5\\pos(640,520)\\fad(0,3000)}fad(0,3000) fade out only'),
]);

export const wrap = preset(
  'wrap',
  '\\q and WrapStyle',
  [
    ev(0, 9, '{\\q0\\an7\\pos(40,30)\\fs34}q0 smart wrap: this long line wraps balanced inside the narrow margins set for the test', { ml: 40, mr: 700 }),
    ev(0, 9, '{\\q1\\an9\\pos(1240,30)\\fs34}q1 end-of-line wrap: this long line wraps greedily inside the narrow margins set for the test', { ml: 700, mr: 40 }),
    ev(0, 9, '{\\q2\\an1\\pos(40,690)\\fs34}q2 no wrap, only \\N breaks: this line stays on one row\\Nsecond row', { ml: 40, mr: 700 }),
    ev(0, 9, '{\\q3\\an3\\pos(1240,690)\\fs34}q3 smart wrap, lower line wider: this long line wraps balanced inside the narrow margins', { ml: 700, mr: 40 }),
  ],
);

export const box = preset('box', 'BorderStyle 3 (box)', [
  ev(0, 9, 'BorderStyle 3: opaque box behind the text', { style: 'Box', mv: 250 }),
  ev(0, 9, '{\\3c&H0000A0&\\bord14}Box colour from \\3c, padding from \\bord', { style: 'Box', mv: 150 }),
  ev(0, 9, '{\\shad8\\4c&H00FF00&\\4a&H40&}Box with \\shad and \\4c shadow', { style: 'Box', mv: 50 }),
]);

export const layers = preset('layers', 'Multi-layer overlap', [
  ev(0, 8, '{\\an5\\pos(640,360)\\fs150\\1c&H0000FF&\\bord0}LAYER 0', { layer: 0 }),
  ev(0, 8, '{\\an5\\pos(660,380)\\fs110\\1c&H00FF00&\\bord0}LAYER 1', { layer: 1 }),
  ev(0, 8, '{\\an5\\pos(680,400)\\fs70\\1c&HFF8000&}LAYER 2', { layer: 2 }),
  ev(0, 8, '{\\an5\\pos(640,580)\\fs36}file order within a layer: later draws on top', { layer: 0 }),
  ev(0, 8, '{\\an5\\pos(640,580)\\fs36\\1c&H00E5FF&\\bord0\\shad0}file order within a layer: later draws on top', { layer: 0 }),
]);

export const collision = preset('collision', 'Collision stacking', [
  ev(0, 9, 'Line A, unpositioned, starts first'),
  ev(1, 9, 'Line B stacks above A'),
  ev(2, 9, 'Line C stacks above B'),
  ev(3, 9, 'Line D stacks above C'),
  ev(0, 9, 'Top: unpositioned top lines stack downwards', { style: 'Top' }),
  ev(1.5, 9, 'Second top line goes below the first', { style: 'Top' }),
]);

export const comments = preset('comments', 'Comments are ignored', [
  ev(0, 8, 'Visible dialogue line. Nothing else may show up.'),
  ev(0, 8, 'COMMENT EVENT: this must NEVER be visible', { comment: true, style: 'Top' }),
  ev(0, 8, '{\\an8\\fs40\\pos(640,120)}inline {this is a comment}text keeps flowing'),
]);
