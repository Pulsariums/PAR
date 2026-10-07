# Performance: heavy karaoke / OP-ED scenes and scrubbing

Sample: a real 23:36 episode, 112,847 events, lossy 24 fps `.par` (2.1 MB). 24,687 frames have events; concurrent events per frame p50 = 1, p95 = 328, p99 = 465, max = 1432 (9.04 s, 5.92 s, 52.6 s). About 90 % of the events are per-letter particles: one glyph, `\an5\pos`/`\move`, `\blur`, `\c`, `\t`, `\frz`, `\fscx/y`, `\clip`, `\fad`, `\alpha`.

## Method

`tools/bench` (Playwright + headless Chromium, **software rendering**, 1280x720, solid background, source decoded in a Worker like the product):

- `run.mjs --par x.par --times 9.04,5.92,52.6,23.375 --frames 72 --play 5 [--trace] [--mode dom|auto-default|canvas]`: seeks to each moment, steps 72 frames at 24 fps (each step waits two `requestAnimationFrame`s, so 33 ms is the floor of this rig), then plays 5 s on a free-running clock. Reports step p50/p95, fps, rAF gap p95, `getMetrics().render`, and with `--trace` the main-thread split from a Chrome trace.
- `seek.mjs`: random seek storms (40 seeks, 50 ms apart, near the heavy moments and anywhere), single-seek latency (seek until the shown line set equals direct evaluation), console errors, long tasks, heap.
- `fidelity.mjs` / `fidelity-real.mjs`: DOM vs canvas pixel difference on fixtures and on the real file.

Numbers are medians of 3 runs; the rig is noisy (about +-15 % between runs), only large differences mean something. A real GPU was not available: software raster makes filters and big canvases more expensive than on a GPU, so treat absolute fps as a floor.

## Where the time went (DOM path, baseline)

Per frame at the heavy moments: raster 34-97 ms (CSS `blur()` filters, thread pool), main thread `FireAnimationFrame` 11-28 ms, layout 5-17 ms (one `offsetWidth` read per scaled fragment, thousands of elements), the rest style / paint / composite. A 1,400-event burst frame cost 0.5 s to build the DOM. State evaluation itself (`evalStates`, `positionAt`, `fadeAlphaAt`) is 0.9-3.1 ms for 1,432 lines, 4-12 % of the JS: not the bottleneck, so a Worker "frame plan" was **not** adopted (it would add a copy of the plan across threads to save a few ms). The plan is a pure function (`canvas/plan.ts: planLine`) that the draw and the lookahead both call, so the same code decides what is drawn and what is built ahead.

## What changed

1. **Canvas particle path** (`src/canvas`, `renderMode: 'auto' | 'dom' | 'canvas'`). Eligible events (`eligibility.ts`) get no DOM at all. Each is a sprite (text, border, shadow, blur rasterised once with `ctx.filter`), drawn per frame with one transformed `drawImage` (position, `\frz`, scale, `\org`, opacity, rect / vector clip). Single-colour sprites are a white mask tinted per colour (colour in the key made the hit rate collapse). Keys are quantised (size 6 %, animated blur 20 %, animated colour 5 bit, ratio 2 %): the sprite is rescaled by at most 3 % when drawn. Cache: LRU by bytes (`spriteCacheMB`, default 96). Fonts and layout scale invalidate it (`Scene.clear`). z-order: consecutive canvas events share one canvas, DOM lines split them into runs (at most 6 canvases; beyond that runs are merged and counted in `runsMerged`).
2. **Lookahead**: sprites of events starting within 1 s are built in spare frame time (at least 2 ms per frame), sampling the same frame grid (`videoFps` or 24 fps).
3. **Level of detail**: opacity < 1/255 is not drawn; blur under 0.35 device px is drawn sharp (counted in `detailDropped`); complex vector clips (hundreds of vertices, 5,000 clip applications in 4 s on this file) are baked once into a clip-sized bitmap instead of clipping on every draw.
4. **Budget**: sprite building a frame needs now is capped (8 ms: blurs left out, 16 ms: remaining new sprites wait). A reduced frame schedules one follow-up draw (`Refiner`), so a paused video ends on the full-quality frame. Nothing is dropped without a counter (`getMetrics().render`).

## Fidelity (canvas vs DOM)

Mean absolute per-channel difference per frame pixel (`fidelity.mjs`, 14 fixtures, 640x360): 0.03 averaged, 0.01-0.15 per fixture; on the pixels either path painted: 0.5-1.5 for blur-only particles, 3-4 with anisotropic scale, 11-17 with border + blur or translucent fill (stroke raster differs by sub-pixel). Real file at 1,000+ particles (`fidelity-real.mjs`, 960x540): whole-frame mean 0.03-0.15, 2-3 on painted pixels.

## Results

Medians of 3 runs, software Chromium, step = 72 frames at 24 fps (floor 33 ms), play = 5 s free-running clock. `before` = commit c12d49a, `dom` = this code with `renderMode: 'dom'`, `auto` = default, `canvas` = forced.

| moment (peak events) | mode | step p50 / p95 ms | play fps | rAF gap p95 ms | JS per frame ms |
|---|---|---|---|---|---|
| 9.04 s (1432) | before | 33 / 69 | 59.6 | 21.5 | 11.5 |
| | dom | 33 / 117 | 53.0 | 21.5 | 11.6 |
| | auto | 33 / 75 | 58.6 | 28.2 | 3.8 |
| | canvas | 33 / 92 | 57.6 | 27.1 | 3.9 |
| 5.92 s (1275) | before | 33 / 62 | 53.4 | 21.7 | 5.8 |
| | auto | 33 / 78 | 56.0 | 26.2 | 4.4 |
| 52.6 s (1265) | before | 33 / 234 | 44.2 | 28.4 | 24.5 |
| | dom | 33 / 254 | 36.4 | 47.9 | 25.4 |
| | auto | 33 / 140 | 52.4 | 37.5 | 9.4 |
| 23.4 s (p95 region, up to 1094) | before | 33 / 278 | 44.8 | 30.2 | 30.1 |
| | dom | 33 / 231 | 37.8 | 52.0 | 29.8 |
| | auto | 33 / 135 | 46.0 | 41.6 | 10.3 |

Reading: on the sustained heavy moments (52.6 s, 23.4 s) the canvas path cuts the p95 frame from 234-278 ms to 135-140 ms and main-thread JS per frame from 25-30 ms to 9-10 ms. On the two burst moments (9.04 s, 5.92 s) there is no gain in this rig: they are bounded by software compositing of the canvases and the one-off sprite build, and the step p95 is within noise of the DOM numbers. `dom` vs `before` differ by run noise only (same code path). The rAF gap p95 is slightly worse with canvas: software compositing of full-stage canvases is the remaining cost (see caveats).

Seek latency (seek until the shown set equals direct evaluation, ms, 8 single seeks: 9.04, 300.2, 5.92, 1000.1, 52.6, 12.3, 700.7, 23.4 s; cold at first visit):

| | Worker source | latencies |
|---|---|---|
| before | yes | 3795, 18, 1922, 161, 2492, 8, 146, 764 |
| after, `dom` | yes | 1110, 11, 1645, 50, 1998, 9, 143, 248 (main thread, same run set) |
| after, `canvas` | yes | 282, 7, 376, 31, 626, 5, 28, 242 |

Storm of 40 random seeks: 0 wrong final frames, longest task 145 ms (canvas) vs 1.1 s (DOM); Worker decode work 161 s before, 3.4 s after.

## Seeking (scrub storms)

Reproduced with `seek.mjs` (and in the Studio with the same file): seeks to the heavy moments took 1.1-3.8 s, a 40-seek storm left 160 s of decoding queued in the Worker and the window did not advance for seconds afterwards (loading never finished while playing). Causes:

1. The decoded-chunk cache held 8 chunks. The file is in file order (style groups), so a time window touches dozens of chunks: every window re-decoded (0.6 s for a 0.5 s window, 24 us/event warm). Now a 64 MB LRU by bytes.
2. A stale read could not be cancelled: `readWindow` ignored the signal and a Worker handles `cancel` only between macrotasks, so each seek queued a full decode ahead of the last one. Reads now check the signal between chunks and yield before a cold chunk; a read the playhead left is aborted; the last seek wins.
3. The DOM path built 1,000+ elements in one frame (0.5 s long task). The canvas path and its build budget remove that.

Tests: `test/seek-storm.test.ts` (random seeks with random read latency, at 24 / 30 / 60 / 23.976 fps, settled frame must equal a whole-script render byte for byte; back/forward phases of `\move` `\t` `\fad`; paused seeks), `test/source-seek.test.ts` (last seek wins, one live read), `test/source-cancel.test.ts` (abort, warm chunks).

## Bursts: a thousand events in one frame (second pass)

The table above is a steady-state view. Playing *into* a burst (`tools/bench/burst.mjs`: free-running clock from a few seconds before the heavy moment, per-rAF counters) showed what a viewer sees as a stutter: in the frames where 1,000+ events start, hundreds of items were not drawn at all (the build budget deferred them: `skipped`), blurs were dropped, and frames took 90-100 ms. Causes, all in the build-ahead (`warmUp`), none in drawing:

1. **It ran only inside a draw, 2-5 ms per frame, one second ahead.** A burst needs ~1,700 sprites (about 0.35 ms of CPU each). It is now a pump (`Scene.pump`): when a slice leaves work, the next one is queued as a message task (a `setTimeout(0)` loop is clamped to 4 ms once nested and left the pump idle two thirds of the time: 1.07 -> 0.44 ms of wall time per sprite when idle). Slices are sized from the cost of recent frames (1.5-6 ms while frames are being drawn, 10 ms when nothing was drawn for 120 ms), nearest start first, 5 s ahead. When no canvas line is on screen it still looks ahead every 6th render.
2. **It re-planned every sample every frame.** Progress is now kept per event (`WarmState.next`).
3. **It warmed the wrong keys.** Samples were taken at 0, 42, 83... ms from the event start, but frames fall on multiples of the video frame length; quantisation boundaries made the two grids differ and about a quarter of the sprites were rebuilt at draw time. `sampleTimes` takes the event's start and samples on the frames that will be drawn.
4. **Vector clips were re-baked every frame.** 92-98 % of draw-time misses in the heavy windows were `bake()`: the file has ~75 clipped glyph shards on screen at once, each living one or two frames with a unique clip. Most of those clips are plain rectangles written as `m x y l ...`; `clipShape` now recognises an axis-aligned rectangle (`rectOfDrawing`) and the canvas applies it as a `rect()` clip. Baking is limited to events that stay put (no `\move`, no animated size or clip) and last 200 ms or more, and is skipped past the build budget (the clip is applied on the draw instead, same pixels).
5. **Sprites covered the whole line box.** A sprite is now cut to the measured ink (`actualBoundingBox*`) plus stroke, offsets and 3 sigma of blur, aligned to whole device pixels: identical pixels (fidelity run unchanged, mean 0.041) and 15-22 % fewer pixels at the heavy moments (peak 2.68 -> 2.27, 1.81 -> 1.42, 2.97 -> 2.51 Mpx per frame).
6. **`\fax` / `\fay` events went to the DOM** (a dozen large glyphs with `\t` on scale and shear appear at 53 s of the sample). They are now drawn on the canvas (`shx`, `shy`: the DOM composes shear, then x-scale, about the box's top-left corner, so the canvas uses `rx * fax` and `fay / rx` about that corner). Fidelity against the DOM: 0.02-0.06 whole-frame mean on four fixtures; sharp text with shear and a border is softer on the canvas (bilinear resampling of the sprite, like rotation).

`burst.mjs` before (the commit this pass started from) and after, 1280x720 software Chromium, e24.par, free-running clock, three windows:

| window (peak events) | gap p99 ms | longest gap ms | items not drawn (deferred) | blurs dropped | sprite builds at draw time |
|---|---|---|---|---|---|
| 7-10.5 s (1432) before | 95 | 99 | 1861 | 437 | 682 |
| after | 59 | 73 | 0 | 86 | 154 |
| 50-54 s (1265) before | 94 | 102 | 2859 | 709 | 1014 |
| after | 51 | 121 | 0 | 190 | 272 |
| 22.6-25 s (1094) before | 91 | 102 | 2312 | 477 | 819 |
| after | 95 | 101 | 87 | 235 | 378 |

Reading: the burst frames themselves (1,000+ events appearing within a few frames) are now clean in the first and second windows: nothing deferred, no frame of the burst over 60 ms. The longest gaps that remain are cold ones: a single frame in the first second after playback starts (nothing built yet, 60-70 sprites at once) or a group of large glyphs that appears right after a burst, before the pump got to it. Seeking into a burst is cold by definition: the sprites it needs are built at that frame under the 8/16 ms budget and finished on the next turns. Seek latency and the storm check are unchanged within run noise (`seek.mjs`: 0 wrong final frames, single seeks 237-465 ms cold).

Steady state improved as well (`run.mjs`, 72 frames at 24 fps then 5 s of free play, same rig, before -> after): draw call p50 7.3 -> 3.4 ms at 52.6 s and 10.9 -> 3.9 ms at 23.4 s (the per-frame re-baking is gone), step p95 128 -> 113 ms and 133 -> 115 ms, free-play 52.0 -> 55.2 fps and 47.2 -> 50.6 fps, rAF gap p95 38.6 -> 32.8 ms and 49.5 -> 35.1 ms.

What is *not* verified: a GPU. Software raster is bound by fill (a 1000-sprite 72x72 micro-benchmark costs 80-90 ms whether drawn with Canvas 2D or instanced WebGL in this rig, recording is 2-3 ms), so this pass reduces the work (pixels, builds, DOM) rather than the cost of a draw call; on a GPU the per-frame cost should be lower still, but the stutter you see there is most likely the builds, which this pass addresses. `getMetrics().render` now also reports `drawn` and `fillMpx` of the last frame (shown in the Studio Metrics panel) to read it off a real machine.

## Load shedding (third pass)

Sustained overload is handled by feedback, not by hope. `LoadMeter` runs its own rAF probe while the loop runs (the render loop may be driven by video frame callbacks, whose spacing says nothing about the main thread) and reports the share of the last 30 display frames that came more than 1.5 frames late; the display frame is the 10th percentile of what it saw, so a machine that is always slow cannot hide behind its own median. `ShedController` turns that into a pixel budget per frame: nothing is limited until frames come late; then the budget is cut to 85 % of what the last frame filled (every 6 renders while the lateness lasts, never below a quarter of the stage) and grows 8 % per step when frames are on time again until it switches off. Over budget, `pickShed` leaves out the items with the lowest weight `alpha / (1 + area / 4000)` first (faint and large: glows and blur margins), with a bias that keeps an item out once it was left out, so nothing flickers. Paused video, a stopped loop and a machine that keeps up never shed. Counted: `getMetrics().render.shed` (items left out of the last frame) and `shedBudgetMpx` (0 = no limit), shown in the Studio Metrics panel.

Result on the real file, 22.6-25 s window (the one with sustained load): gap p99 94 -> 44 ms, frames over 50 ms 5 -> 1, 233 faint items left out in 60 frames. The other two windows never trigger it.

What it cannot do: a single frame that is expensive *by itself* (the first frame of a group of 1,000 px glows, 5+ Mpx of fill) is late before anything can be measured; feedback only protects the frames after it. Those remain (one 90-120 ms frame in 4 s in the software rig, mostly in the first second after playback starts, when nothing is built yet).

## Caveats

Software Chromium only; fonts of the sample are not installed, so both paths use the same fallback font; the first draw of a never-seen heavy moment after a seek still shows the scene over a few frames (sprites are built under the budget), after a cold decode of 0.3-0.6 s in the Worker.
