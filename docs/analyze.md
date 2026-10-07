# Analyze: what a script costs before you play it

`analyzeAss` reads an ASS script and tells you, without a video and without drawing anything, **when** lines pile up, **which sprites** the canvas path would have to build and what that costs, **why** events do or do not qualify for the canvas path, how many events are frame-by-frame runs, and which styles and fonts are never used. It is read-only: nothing is rewritten (that is [Optimize](optimize.md)).

```
par analyze in.ass [--json] [--out file.json] [--fps 24] [--width PX] [--burst 40] [--keys 2000] [--no-chains]   CLI
import { analyzeAss, analyzeSource, summaryText } from 'pulsar-ass-renderer/analyze'                              library
Lab view of the site: "Analyze" fold (selected subtitle, Worker, progress and cancel, copy / copy JSON / save)
```

In this checkout the CLI is `npm run xpar -- analyze in.ass`.

## Real output

A two-event script (`w.ass`):

```
w.ass  (0.0 s)
2 events, 0:15.0, layout 1280x720, 24 fps, sprite scale 1
peak: 1 lines visible at 0:01.0; 0 bursts (jumps of lines)
canvas path: 1 events qualify (50.0 %; 46.2 % of line time); not: stacking 1
sprites: 1 distinct keys (0 shared glyph masks), 1 lookups, est. build 0.0 s (0.17 ms each), est. 0 MB if all kept
seconds with new sprites: 1 of 13; busiest second needs 1 keys
frame-by-frame runs: 0 chains, 0 events, 0 fewer if merged (par optimize)
styles: 1 defined, 0 unused; fonts used: Arial 2
```

400 single-letter particles (`\pos \blur \bord \c \t(\frz \fscx)`) all on screen for 30 s:

```
400 events, 0:30.0, layout 1280x720, 24 fps, sprite scale 1
peak: 400 lines visible at 0:00.0; 0 bursts (jumps of lines)
canvas path: 400 events qualify (100.0 %; 100.0 % of line time)
sprites: 1,600 distinct keys (0 shared glyph masks), 1,600 lookups, est. build 0.7 s (0.443 ms each), est. 14 MB if all kept
seconds with new sprites: 4 of 30; busiest second needs 400 keys
```

Lines of the summary, in order:

| line | meaning |
|---|---|
| events, length, layout, fps, sprite scale | the script as the analysis saw it. `--fps` is the rate the picture is shown at (default 24); the scale is `--width` divided by the layout width (default 1: the layout width), and sprite keys depend on it |
| peak, bursts | most lines visible on one frame and when; a **burst** is a frame with at least `--burst` (default 40) more lines than the frame before |
| canvas path | events the [canvas path](performance.md) takes, as a share of events and of line time, and the most common reasons the rest stays DOM (`stacking`, ...) |
| sprites | distinct sprite keys, shared glyph masks, lookups, estimated build time and per-sprite cost, estimated memory if every sprite were kept. `[key table capped]` appears when more than `maxKeys` (400,000) distinct keys were seen: past that they are only counted |
| costliest bursts | up to 8 bursts by estimated build time: time, lines before -> peak, new sprites, est. ms (only printed when there are bursts) |
| seconds with new sprites | in how many seconds of the video a sprite is needed for the first time, and the most keys one second needs |
| frame-by-frame runs | chains of events a frame apart that [Optimize](optimize.md) can merge, and how many events fewer that would be (`not measured` for a windowed source, which has no text) |
| styles | styles defined, unused ones (first 6 named), fonts used with their event counts (first 5), fonts named by a style that no event ends up using |

Build times are estimates from a fixed per-sprite cost model, not a measurement of your machine; use them to compare scripts and moments, not as milliseconds to promise.

## JSON (`par-analyze/1`)

`--json` prints the report on stdout, `--out file.json` writes it (and still prints the summary). The Lab saves `name.par-analyze.json`. Fields: `input` (events, durationS, layout, fps, scale, bytes), `peak`, `seconds[]` (per second: starts, visible, requests, keys, newKeys, buildMs), `bursts[]` (at, before, peak, newKeys, buildMs), `sprites`, `keys[]` (first use time, uses, buildMs; the first `--keys` by first use, default 2,000, 0 = none), `canvas` (events, share, lineSeconds, lineSecondsShare, reasons), `chains` (null when not measured) and `styles`. No subtitle text and no file name are in it.

## Limits

- 30-100 MB scripts are fine: it reads line by line, keeps series and one record per distinct sprite key, and yields to the event loop every few thousand events (progress and cancel work; the Lab runs it in a Worker).
- `analyzeSource` takes any `SubtitleSource` (read in windows of `windowSeconds`, default 20); frame-by-frame runs need the text and are not measured there.
- It follows the library's own eligibility and key rules, so the numbers describe what the renderer will really ask for; if the renderer changes those rules the analyzer changes with it.
