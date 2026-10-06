# PAR: lossy, render-baked subtitles

Status: **prototype, Phase A**. Code: `src/format/bake/`. CLI: `par bake`. Same container as [XPAR](XPAR.md)
(header flag bit 0 = `LOSSY`), so one reader opens both and `parHeader(file).lossy` tells them apart.

> **PAR is one-way.** The original ASS cannot be reproduced from a `.par`. `file.toAss()` throws `UNSUPPORTED` on it.
> Applications that keep subtitles must store the lossless `.xpar` and offer `.par` only as an export.

| | |
|---|---|
| Naming (proposal) | lossless `name.xpar`; lossy `name.<fps>fps.par`, e.g. `episode01.24fps.par` (`parFileName`) |
| MIME (proposal) | `application/vnd.pulsar.par` |
| Header information | lossy flag, target fps, SHA-256 and size of the source ASS, source duration, encoder id (`parHeader`) |

## What the bake does (`Baker`, `par bake --fps N`)

Input: an ASS with the standard V4+ event layout (anything else fails with `UNSUPPORTED`: use XPAR). One pass, streaming.
Frame `k` is sampled at `t_k = (k + phase) / fps` (default phase 0).

1. **Frame-grid quantisation.** An event is visible on frame `k` iff `start <= t_k < end`. The first and the one
   past the last visible frame are computed; the event is rewritten to start/end on the grid
   (`floor(t*100)` centiseconds, which always falls inside the same frame interval for `fps <= 90`). Only
   events **without time-dependent tags** are moved (`\t \move \fad \fade \k..` depend on `t - start`; moving their start
   would change the picture, so those keep their original times).
2. **Events that no frame shows are dropped** (also when animated). 60 fps lines baked for 24 fps lose ~60 % of the lines.
3. **Merging.** Consecutive identical static lines that are positioned (`\pos`) and adjacent in time
   become one event (restricted to positioned lines because unpositioned lines take part in collision stacking).
4. **Numeric precision** below a stated tolerance. Default `tolPx = 1/8 px` at a render height equal to PlayResY.
   Rounding to a multiple of `q` errs by at most `q/2`, so `q = 2*tol/gain`, with the worst-case gain per tag
   (`quanta()` in `bake/params.ts`): positions/`\org`/clip/border/shadow: 1; angles: `diagonal * pi/180`;
   `\fscx/\fscy` percent: `width/100`; `\fs`: `width/size`; shear: `height`; drawings: `2^(p-1) / max glyph scale`;
   `\blur` uses `tol/2` (heuristic, a blur radius has no hard displacement bound). Defaults at 1920x1080:
   positions 0.25, angles 0.005 deg, scale 0.01 %, shear 0.0001. Colours, alphas and all tag times are untouched.
5. **One-frame animations are evaluated and removed.** A line that is visible on exactly one frame is sampled at
   exactly one instant: `\move` becomes `\pos` at that instant, `\t` with progress 0 is dropped, with progress 1 its tags
   are inlined, `\fad` that is fully opaque at that instant is dropped (using PAR's own `positionAt`, `transitionProgress`,
   `fadeAlphaAt`, so the baked line renders like the original in PAR). A line where anything stays partially animated
   is left untouched (original times).
6. **Unrenderable data is stripped:** `Comment:` lines, the `Name` and `Effect` fields (PAR does not render them),
   tags PAR ignores (`\fe`, unknown tags), empty override blocks and comment text inside `{}`, all sections except
   Script Info, Styles, Events.

Not done (honest list): baking `\t/\move/\fad` of multi-frame lines into per-frame samples. A parametric line is
always smaller than its samples; the only case where sampling would pay is a multi-frame line whose animation is
cheaper to bake than to evaluate, and that is a render-speed concern, not a size one. Also not done: dropping
fully transparent lines, rounding colours/alpha, reordering.

Baked events carry the original dialogue ordinal as sort key, so z-order among equal layers is preserved even though
merged events are written later than their first frame.

## Visual equivalence verification (`tools/xpar/verify-par.ts`)

Renders the source ASS and the decoded `.par` with PAR itself in headless Chromium (Playwright), at `t_k = k/fps`
for a sample of frames, screenshots both, compares per pixel (max and mean channel difference, fraction of pixels
over 8/255). A control (source at `t` against source at `t + 1 frame`) and a render-twice check show what the
metric reacts to. Results: see the table in the report section below.

Honest limits of the guarantee:
* The guarantee is about samples at the **target frame grid**. A player that samples at another phase or another fps
  can show lines the bake dropped, or an event edge up to one frame early/late. Set `phase` when you know it.
* "1/8 px" bounds geometry, not pixels: a browser rasteriser is discontinuous (glyph hinting, anti-aliasing), so a
  sub-pixel move can flip a few edge pixels by far more than 8/255. The measured numbers are in the table.
* The tolerance assumes the script is displayed at `renderHeight` (default PlayResY). Showing it 2x bigger doubles the error.
* Baking reduces **file size, parse time and memory**, not render cost: browser rendering cost follows the
  total bitmap size on screen, not the number of lines (cf. FBF-ifier, which goes the other way: it expands `\t`/`\move`
  into per-frame lines for renderers that handle those badly).
