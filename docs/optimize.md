# Optimize: frame-by-frame typesetting to `\move` / `\t`

Typesetting tools (and some exporters) write a moving sign as **one event per video frame**: same text and tags, `\pos` and a few numbers a little different each time. A minute of that is thousands of events. `optimizeAss` finds such runs and writes each as a single event with `\move` and `\t`, so the file is smaller, parses faster and the renderer has far fewer events to draw.

It is **lossy by design and checked**. It is not part of XPAR (XPAR returns the file byte for byte); it writes a new ASS. Keep the original.

```
par optimize in.ass out.ass --fps 24 [--mode invisible] [--min-chain 3]      CLI
import { optimizeAss } from 'pulsar-ass-renderer/optimize'                     library
Lab view of the site: "Optimize" fold (selected ASS subtitle, Worker, progress, result added to the shelf)
```

## What it does

1. **Finds runs.** Events of one shape (layer, style, margins, text and the same tags in the same order, only numbers differ) where each starts exactly where the last ended. Several particles of one shape are told apart by the nearest value, as an exporter keeps their order from frame to frame.
2. **Fits straight pieces.** For every number that changes (`\pos`, `\frz \frx \fry`, `\fscx \fscy`, `\fax \fay`, `\fs`, `\fsp`, `\bord \shad` and their x / y forms, `\blur \be`, colours `\c \1c-\4c` as three channels, alpha `\alpha \1a-\4a`) it takes the frames the run is shown on at the **target video fps** (whole milliseconds, like the renderer) and cuts the run into the longest pieces that one straight line per number reproduces within the tolerance. A curved path becomes several `\move`s; a straight one becomes one.
3. **Writes** each piece as one event: the first event's tags with the numbers that moved written at the first frame, and a `\t(t1,t2,...)` (`\move(x1,y1,x2,y2,t1,t2)` for the position) to the last frame, timed **between the first and the last frame instant**. Outside them the value holds, so nothing is extrapolated past what was seen (alpha and colour channels have a range, extrapolating them needed clamping and was wrong: the check caught it).
4. **Checks every merged event** against the lines it replaces, on every video frame it covers, with the renderer's own evaluation (`evalStates`, `positionAt`: the code PAR draws with). A merged event that differs by more than the tolerance is thrown away and its original lines stay (`rejected` in the stats).
5. **Keeps the drawing order.** Events of one layer are drawn in file order, so a merged event cannot simply go where its first frame was. For events that can cover the same pixels (a circle around the anchor that holds the text, outline, shadow and blur; `\org` or an unknown place means "may overlap anything") the order at every moment they show together is kept: the merged line is placed after the lines it was drawn above and before the ones it was below, and in the right order against other merged events. When no single place keeps the order (A over B on some frames, B over A on others, or a cycle), those events stay as they were (`orderConflicts`).

## Tolerance (`--mode`)

The largest on-screen displacement a number may cause, at the script's own height, for an event of the size the text really has (an angle error moves the far end of the text, a scale error stretches its width, ...):

| mode | displacement | colour / alpha |
|---|---|---|
| `exact` | 0.00125 px | 0.5 level (whole numbers only: the line must fit exactly) |
| `invisible` (default) | 0.125 px | 2 levels of 255 |
| `loose` | 0.5 px | 4 levels |

The fit itself may use 85 % of it; the rest is for rounding the written numbers (the shortest decimal that fits). Whole-number channels pay two roundings on top of the fit (the written ends and the renderer's rounding of every interpolated value), which come off their budget. Frame instants are whole milliseconds, so at fast motion (several pixels a frame) a line through the frames is off the exact positions by up to ~0.1 px: that is why `exact` only merges slow or static runs.

## What it will not touch

Events with `\t`, `\move`, `\fad`, `\fade`, karaoke tags, `\p` drawings, several override blocks, or a text the format model cannot reproduce exactly; `Comment:` lines, the header and every line it did not merge stay byte for byte. Varying `\clip` / `\org` are not fitted (a constant one is fine and stays). Scripts with another event `Format:` than the standard V4+ one are returned unchanged. Line endings (LF / CRLF) are kept.

## Results

* Synthetic frame-by-frame sample (`a-text-24` of the XPAR benchmark: 456,856 particle events, 66.5 MB, one layer, random write order within a frame): **293,892 events (35.7 % fewer), 52.5 MB, 81 s**, 0 rejected, 69,238 events kept for drawing order. Checked independently (`tools/xpar/verify-opt.ts`: both files parsed with PAR, 300 random frames): 94,477 events compared, 25,768 overlapping pairs checked for drawing order, all match at `invisible`; the same output checked at the `exact` tolerance reports 26,093 mismatches of 0.01 to 0.05 px (so the checker does see differences).
* A clean three-sign frame-by-frame script (720 events, curved paths): 122 events (83 % fewer).
* The real episode sample `e24.ass` (112,847 events) is **not** frame by frame (its particles already use `\move` and `\t`): 29 lines saved, 4 s. The tool helps files made frame by frame; it cannot shrink what is already compact.

Randomised tests (`test/optimize-fuzz.test.ts`): 24 scripts of several particles (noise, curves, colour and alpha fades, gaps, per-frame order shuffled) in all three modes and 30 dense ones where events overlap and their write order changes: every frame of the result must show the same events, the same drawing order for overlapping ones and every number within the mode's tolerance.

## Limits (honest)

* The result is judged at the fps you give. At another frame rate or phase the merged event shows the in-between positions the frame-by-frame file never showed (usually smoother, not identical).
* Drawing order is kept for events that can overlap by the circle test; it is conservative (events that cannot actually touch may still be kept apart), and the placement works on whole file lines.
* One straight piece per number and event: a run whose numbers need different breakpoints is cut at the union of them.
* Memory: the script is read as one string (the site refuses above 120 MB, the CLI has no cap beyond Node's). Work grows with how many merged events overlap on screen at once.

Code: `src/optimize/` (`events.ts` reads a line, `chains.ts` finds runs, `fit.ts` fits, `emit.ts` writes, `verify.ts` checks, `order.ts` + `grid.ts` keep the drawing order, `tolerance.ts` the modes). Tests: `test/optimize*.test.ts`.
