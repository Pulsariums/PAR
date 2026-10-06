import { ev, preset } from './ass';

/** Presets about transforms, clips and drawings. */

export const rot = preset('rot', '\\org \\frx \\fry \\frz', [
  ev(0, 8, '{\\an5\\pos(240,200)\\frx0\\t(0,6000,\\frx360)}frx'),
  ev(0, 8, '{\\an5\\pos(640,200)\\t(0,6000,\\fry360)}fry'),
  ev(0, 8, '{\\an5\\pos(1040,200)\\t(0,6000,\\frz360)}frz'),
  ev(0, 8, '{\\an5\\pos(640,360)\\org(640,480)\\fs40\\t(0,8000,\\frz360)}\\org orbit'),
  ev(0, 8, '{\\an5\\pos(640,670)\\frx40\\fry-25\\frz8\\fs48}static 3D: frx40 fry-25 frz8'),
]);

export const shear = preset('shear', '\\fax \\fay', [
  ev(0, 8, '{\\an5\\pos(640,150)\\fax-0.4}fax -0.4'),
  ev(0, 8, '{\\an5\\pos(640,280)\\fax0.4}fax 0.4'),
  ev(0, 8, '{\\an5\\pos(320,450)\\fay0.3}fay 0.3'),
  ev(0, 8, '{\\an5\\pos(960,450)\\fay-0.3}fay -0.3'),
  ev(0, 8, '{\\an5\\pos(640,620)\\t(0,4000,\\fax0.8)}animated fax'),
]);

export const scale = preset('scale', '\\fscx \\fscy \\fs', [
  ev(0, 8, '{\\an5\\pos(640,120)\\fscx50}fscx 50'),
  ev(0, 8, '{\\an5\\pos(640,240)\\fscx200}fscx 200'),
  ev(0, 8, '{\\an5\\pos(320,420)\\fscy50}fscy 50'),
  ev(0, 8, '{\\an5\\pos(960,420)\\fscy180}fscy 180'),
  ev(0, 8, '{\\an5\\pos(640,620)\\fs30}fs30 {\\fs+20}fs+20 {\\fs-10}fs-10 {\\fs90}fs90'),
]);

export const fsp = preset('fsp', '\\fsp letter spacing', [
  ev(0, 8, '{\\an5\\pos(640,160)\\fsp0}fsp 0'),
  ev(0, 8, '{\\an5\\pos(640,280)\\fsp12}fsp 12'),
  ev(0, 8, '{\\an5\\pos(640,400)\\fsp-3}fsp -3 tight'),
  ev(0, 8, '{\\an5\\pos(640,540)\\t(0,5000,\\fsp30)}animated fsp'),
]);

export const clip = preset('clip', '\\clip rect', [
  ev(0, 8, '{\\an5\\pos(640,180)\\clip(0,0,640,720)}left half only: clip(0,0,640,720)'),
  ev(0, 8, '{\\an5\\pos(640,360)\\clip(0,0,0,720)\\t(0,4000,\\clip(0,0,1280,720))}clip reveal animated with \\t'),
  ev(0, 8, '{\\an5\\pos(640,540)\\clip(0,0,100,100)\\clip(300,500,980,580)}last \\clip wins'),
]);

export const iclip = preset('iclip', '\\iclip rect', [
  ev(0, 8, '{\\an5\\pos(640,300)\\fs90\\iclip(500,250,780,350)}HOLE IN THE TEXT'),
  ev(0, 8, '{\\an5\\pos(640,520)\\iclip(0,0,0,0)\\t(0,4000,\\iclip(300,460,980,580))}iclip animated with \\t'),
]);

export const vclip = preset('vclip', '\\clip vector', [
  ev(0, 8, '{\\an5\\pos(640,360)\\fs110\\clip(m 640 80 l 940 360 640 640 340 360)}DIAMOND'),
  ev(0, 8, '{\\an5\\pos(640,660)\\fs40\\iclip(m 560 630 l 720 630 720 690 560 690)}inverse vector clip'),
  ev(0, 8, '{\\an5\\pos(350,120)\\fs60\\clip(2,m 400 120 l 1000 120 1000 360 400 360)}scaled clip'),
]);

const SHAPES = 'm 0 0 l 120 0 120 120 0 120';
export const drawing = preset('drawing', '\\p drawings', [
  ev(0, 8, `{\\an7\\pos(100,100)\\p1\\1c&H3060FF&\\bord3}${SHAPES}`),
  ev(0, 8, '{\\an7\\pos(300,100)\\p1\\1c&H40E080&}m 60 0 l 120 120 0 120'),
  ev(0, 8, '{\\an7\\pos(500,100)\\p1\\1c&HFF8030&}m 0 60 b 0 0 120 0 120 60 b 120 120 0 120 0 60'),
  ev(0, 8, '{\\an7\\pos(700,100)\\p1\\1c&H00D0FF&\\bord2\\shad4}m 0 0 l 60 0 60 60 120 60 120 120 0 120'),
  ev(0, 8, '{\\an7\\pos(900,100)\\p2\\1c&HC050E0&}m 0 0 l 30 0 30 30 0 30'),
  ev(0, 8, '{\\an7\\pos(100,330)\\p1\\blur3\\1c&HFFFFFF&}m 0 0 l 120 0 120 60 0 60'),
  ev(0, 8, '{\\an7\\pos(300,330)\\p1\\pbo-30\\1c&H60FF60&}m 0 0 l 120 0 120 60 0 60'),
  ev(0, 8, '{\\an5\\pos(640,600)}Text with {\\p1\\1c&H0000FF&}m 0 0 l 40 0 40 40 0 40{\\p0\\1c&HFFFFFF&} inline drawing'),
]);
