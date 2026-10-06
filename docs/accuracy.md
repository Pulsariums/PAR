# Rendering accuracy against libass

PAR's reference is libass (what Aegisub, mpv and JASSUB run). This page records what libass does (read from
`raw.githubusercontent.com/libass/libass/master`), what PAR did before and does now, and the measured difference
against a real libass build: JASSUB 2.5.18 (WASM), rendered by headless Chromium 1194 next to PAR on the same
background, 640x360, Liberation Sans from the same TTF files. JASSUB is only a test oracle (never a dependency).
"mean/max" are per-pixel absolute RGB differences over the whole frame (0-255). Glyph anti-aliasing differs between
FreeType and Skia, so a plain unblurred, unbordered text line already scores mean 0.3-0.5 / max about 110-160; compare
cases with each other, not with zero. Oracle caveats: the JASSUB build does not kern (PAR kerning was disabled in the
comparison with `font-kerning: none`; stock libass with HarfBuzz and `Kerning: no` does not kern either), and in canvas
mode it has no storage size (see "Scale bases").

## libass semantics (source references)

- **Which bitmaps blur**: `ass_render.c` `render_and_combine_glyphs` builds the `FILTER_*` flags, `ass_composite_construct`
  runs `ass_synth_blur` (`ass_bitmap.c`) on the outline bitmap always and on the fill bitmap only when there is no border
  (or BorderStyle 3). With a border the fill stays sharp and only outline and shadow blur.
- **Order and shadow**: gaussian first, then `\be`. The shadow is a copy of the blurred outline (or of the blurred fill
  without border), shifted afterwards. Drawing order: shadow, outline, fill.
- **Carving**: `ass_fix_outline` subtracts the glyph from the outline when the fill is not fully opaque
  (`FILTER_FILL_IN_BORDER` needs `a1 == a2 == 0` and no fade). A fully transparent fill with a border therefore gives a
  hollow outline and a hollow shadow; a translucent fill keeps a solid shadow silhouette.
- **`\blur`**: sigma = `blur * 2 / sqrt(ln 256)` = 0.849 per unit, clamped to 0..100 (`BLUR_MAX_RADIUS`, `ass_parse.h`),
  scaled by `blur_scale` (frame size / layout resolution, `init_font_scale`). It is never scaled by ScaledBorderAndShadow.
- **`\be`**: rounded with `+0.5`, clamped to 0..127 (`MAX_BE`); each pass is the 3x3 kernel `[1 2 1; 2 4 2; 1 2 1] / 16` on
  device pixels (`c/c_be_blur.c`), i.e. variance 1/2 per axis per pass; not scaled by the render size.
- **Scale bases** (`init_font_scale`, `ass_layout_res`): border scale is frame/PlayRes with ScaledBorderAndShadow, else
  frame/layout resolution (LayoutRes, else the storage size, else PlayRes); blur always uses frame/layout resolution.
  Without a storage size (canvas-only JASSUB, libass issue 591) both are frame/PlayRes, so the flag changes nothing.
  mpv and JASSUB-with-video set the storage size to the video size.
- **Border and shadow**: border is not scaled by `\fscx`/`\fscy` (stroked in screen space); `\shad` is clamped to >= 0,
  `\xshad`/`\yshad` may be negative; joins are round; `\xbord != \ybord` gives an elliptical border.
- **`\clip`**: rect corners are integers (`argtoi32`) and are NOT reordered; a rect with x2 <= x1 or y2 <= y1 hides the
  line (`\clip`) or hides nothing (`\iclip`). The rect is applied per bitmap after blur and shadow, in script coordinates
  scaled to the frame, so it never follows `\pos`, `\move`, `\org` or rotation (`render_glyph`, `render_glyph_i`). Last rect
  clip wins; the FIRST vector clip wins (`complex_tag("clip")`: `!clip_drawing_text.str`) and a vector clip applies together
  with a rect clip (`blend_vector_clip`, mask scaled by `screen_scale / 2^(scale-1)`). `\t(\clip)` animates only rects, from
  the whole script area when the line has none, truncating to integers each step.
- **Drawings** (`ass_drawing_parse`): the last contour is closed (stroke has no gap); box width/height = control-point box
  (`advance = x_max - x_min`, `asc = y_max - y_min`), drawing origin at the box's top-left.
- **Fade**: `ass_apply_fade` mixes the fade into each of the four alphas; fade only applies when positive.
- **BorderStyle 3** (`get_bitmap_glyph`): box = advance + 2 x border, "double scaled" by `\fscx/\fscy` (VSFilter quirk),
  minimum 1 px. BorderStyle 4 (`add_background`): one box over the whole event.
- **Collisions** (`fix_collisions`): per layer, `detect_collisions = 0` for `\pos`, `\move`, `\org`, `\t`; middle-aligned
  lines stack downward; the rectangle includes the border. (PAR: only `\pos`/`\move` are exempt, middle alignment is not
  stacked, borders not counted. Lives in `src/layout` and `src/core`: not changed here, see open items.)

## Per-effect result

Cases are `cmp` ASS files (generated; recipe at the end). Before = commit 0dc09d5, after = this change.

| Effect | libass behaviour | PAR before | PAR after | mean / max before -> after |
|---|---|---|---|---|
| `\blur`, no border | fill blurred, sigma 0.849 N | whole fragment, sigma N + wrong scale base | same layer, correct sigma (edge profile 10-90% width 11 px vs 11 px for N=5) | 0.44 -> 0.28 (01), precision rect 0.62/30 -> 0.22/12 (40) |
| `\blur` with `\bord` | outline + shadow blurred, fill sharp | fill and outline blurred together | separate shadow / outline / fill layers | 2.98 -> 0.95 (02); precision rect 5.68/155 -> 0.26/29 (41) |
| `\be` | box passes on device pixels | 0.6 sqrt(N) layout px | gaussian sigma sqrt(N/2) device px (`--par-u`), rounding and 127 cap | 0.82 -> 0.55 (03) |
| blur + shadow | shadow = blurred copy | shadow blurred with text only when no border | per-layer shadow, hollow shadow for invisible fill | 3.05 -> 0.74 (04); 2.65/146 -> 0.15/54 (42) |
| translucent / invisible fill with border | glyph carved from outline and shadow | stroke visible through the fill | SVG carve filter (glyph cut from blurred outline) | 3.71 -> 0.59 (05), 3.56 -> 2.01 (27) |
| `\clip` / `\iclip` rect | per bitmap, integers, no reorder, empty rect semantics | corners reordered | libass rules | 3.92 -> 0.75 (50) |
| vector `\clip`, mixed with rect | first vector wins, both apply | last wins, only one | `par-vclip` wrapper + rect on the root | 4.52 -> 0.51 (51) |
| `\clip` with `\pos`/`\move`/`\frz`/`\t` | fixed in script coordinates | already fixed (clip on the root) | unchanged; `\t(\clip)` starts from the full script area | 1.13 (12), 1.06 (14), 0.74 (52) |
| clip + blur/shadow | clip after blur | same | same | 3.54 -> 0.80 (13) |
| drawing + border | closed contour, control-point box | open last edge (left stroke missing), box from origin | closed, control-point box | 4.50 -> 0.37 (30) |
| `\blur` with `\fscx`/`\fscy` ratio | round on screen | stretched | SVG blur with sigma per axis | row 8.5 -> 1.5 (53) |
| border with `\fscx`/`\fscy` | not scaled by font scale | stroke stretched with x scale | unchanged: **approximate** | 3.08 (23), row 9.6 (53) |
| `\xbord != \ybord` | elliptical | larger of the two | unchanged: **approximate** | 3.60 (22) |
| ScaledBorderAndShadow=no, PlayRes != frame | no-op without storage size | screen-pixel border | unchanged (layout/core decision) | 4.32 -> 2.97 (21, blur part fixed) |
| `\fad`, karaoke, BorderStyle 3, rotation, shear | | | unchanged | 2.02 -> 0.82 (28), 1.42 -> 0.84 (29), 1.50 -> 1.42 (26), 0.56 (24), 1.75 -> 1.15 (25) |
| collision stacking, wrap/margins | see above | | not touched | 8.78 (31), 20.11 (32): layout differences remain |

## What stays approximate or unsupported (honest list)

- Glyph rasterisation, hinting, sub-pixel positioning and synthetic bold: browser vs FreeType, not matchable.
- Stroke joins are miter in CSS text stroke, round in libass; `\xbord`/`\ybord` use the larger value; border is stretched
  by the `\fscx/\fscy` ratio (no per-axis stroke in CSS). A box via `feMorphology` would be squarer, so it was not used.
- `\be` is a gaussian model of the box passes (variance exact, shape not); the `\be` part of an SVG-filter plate is applied
  after the carve instead of before.
- Blur is applied before shear and perspective (`\fax`, `\frx`, `\fry`); libass blurs the final bitmap.
- Clip edges are anti-aliased; libass cuts rects on whole pixels. Rect `\clip` + `\iclip` vector exotic combinations: only
  one rect and one vector clip are kept.
- Fade is a group opacity; libass fades each bitmap, so a shadow under a fading outline shows through slightly there.
- Not changed (other owners): ScaledBorderAndShadow default (the cross-check report says current libass defaults to `no`;
  `src/parser/ScriptInfo.ts` defaults to yes), LayoutRes/storage scale base, collision rules, perspective distance.
- BorderStyle 4 and `Effect` banners: unsupported.

## What JASSUB teaches (config, not code)

Storage size = video resolution except in canvas-only mode (libass issue 591), default font `liberation sans` bundled and
fonts fetched lazily, `libassMemoryLimit` / `libassGlyphLimit` cache caps, `prescaleFactor` / `prescaleHeightLimit` /
`maxRenderHeight` to bound the raster size, skipped frames while busy, colour-matrix correction (BT.601/709) from the
track's `YCbCr Matrix`, `timeOffset`. libass itself caps `\blur` at 100 and `\be` at 127; PAR now does the same.

## Matrix updates for the site (apply in `site/src/playground/features.ts` and `site/src/i18n/hints.ts`)

- `\blur \be` (status `approx`): split into `\blur` = `rendered` and `\be` = `approx`.
- `\bord \shad` stays `rendered`; `\xbord \ybord` stays `approx` (note: also border stretched by `\fscx/\fscy`).
- `\clip rect` / `\iclip rect` / `\clip vector` stay `rendered`.
- Hint for the blur preset: replace "(approximation: fill and outline blur together)" with "with a border only outline and
  shadow blur, the fill stays sharp (like libass); `\be` is a gaussian model".
- Hint for clip presets: add "corners are not reordered (an empty rect hides the line, like libass)" and "first vector
  clip wins, together with a rect clip".

## How to reproduce

Install `jassub` in a scratch directory outside the repo, bundle it with vite (worker + wasm), serve it with a PAR build
(`vite build --outDir <scratch>`), and for each ASS render JASSUB (`renderer._drawCapture(t)`) and PAR on identical
backgrounds in headless Chromium (`--disable-lcd-text`), screenshot both and diff. Tests that do not need JASSUB:
`test/accuracy-blur.test.ts` (sigma, `\be`, plate decisions), `test/accuracy-plates.test.ts` (layer DOM),
`test/accuracy-clip.test.ts` (clip rules).
