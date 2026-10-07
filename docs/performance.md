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

**Correction after a real report (RTX 4060 laptop, 113k-event script).** 709 of 1,172 frames were shed (up to 1,049 items, about 70 % of the visible lines left out) while the frames filled only 0.1 Mpx; the late frames were the ones where sprites were being built (cache misses 50-360 per second, worst gaps with few lines on screen). Leaving sprites out does not make building cheaper, so the controller now ignores lateness unless compositing explains it: the time of the draw phase (separate from the time to get the sprites, `CanvasLayer.resolveMs` / `compositeMs`) must average at least 4 ms, or the frame must ask for at least two stages of pixels (a GPU canvas costs little JS time but real fill time). Lateness caused by builds is the job of the build budget and the look-ahead, not of shedding.

Result on the real file, 22.6-25 s window (the one with sustained load): gap p99 94 -> 44 ms, frames over 50 ms 5 -> 1, 233 faint items left out in 60 frames. The other two windows never trigger it.

What it cannot do: a single frame that is expensive *by itself* (the first frame of a group of 1,000 px glows, 5+ Mpx of fill) is late before anything can be measured; feedback only protects the frames after it. Those remain (one 90-120 ms frame in 4 s in the software rig, mostly in the first second after playback starts, when nothing is built yet).

## Caveats

Software Chromium only; fonts of the sample are not installed, so both paths use the same fallback font; the first draw of a never-seen heavy moment after a seek still shows the scene over a few frames (sprites are built under the budget), after a cold decode of 0.3-0.6 s in the Worker.


## Stutter on weak-device conditions: before / after the look-ahead rewrite (2026-10-07)

Question: does `805f6a8` (warm planner + sprite worker pool) fix the stutter of the RTX 4060 report (frame gap p99 108 / max 342 ms, 2,093 sprite misses in 30 s, bursts of 1000+ particles every ~2 s)? Answer from the sandbox: **only partly; on the real-file bursts yes, on the synthetic report pattern no, under CPU throttling no.**

Method (`tools/bench/stutter.mjs`, `stutter-matrix.mjs`, `gen-karaoke.mjs`; raw runs in `tools/bench/results/stutter-2026-10-07.jsonl`): 1280x720 software Chromium, free-running clock, a gap = time between two rAF callbacks, 3 runs each, median shown (max column = median of the per-run max). `base` = ae8b5e8 (git worktree, same harness and fixtures), `new` = 805f6a8 workers on, `new-off` = same build with the Worker constructor blocked for blob:/data: URLs by an init script (pool fails, main thread builds; no public option added). Conditions: C1 = no throttle, 4 cores; C2 = CDP `Emulation.setCPUThrottlingRate` 4, `hardwareConcurrency` 4; C3 = rate 4, cores 2 (pool = 1 worker, confirmed `workers` = 1). Scenarios: three e24.par burst windows (as `burst.mjs`), `synth 60s` (`gen-karaoke.mjs`: 26k events, 1,100 per-glyph blur particles every 2 s, quiet 22-32 s, 8 % animate colour/blur, about 2x the sprite misses of the report), cold start (no pre-roll), seek into a burst. Columns: gap ms, frames over 33/50/100 ms, long tasks (count / longest ms), `getMetrics().render` deltas (sprite misses, deferred = `skipped`, blurs dropped), shed frames, workers, workerBuilt, max `planQueued`.

| cond | scenario | build | n | p50 | p95 | p99 | max | >33 | >50 | >100 | long tasks (n / max ms) | sprite misses | deferred | blurs dropped | shed frames | workers | workerBuilt | planQueued max |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | burst 7-10.5 | base | 3 | 16.7 | 23.3 | 52.6 | 78.5 | 7 | 2 | 0 | 5 / 117 | 150 | 0 | 54 | 0 | - | - | 0 |
| C1 | burst 7-10.5 | new | 3 | 16.8 | 22.1 | 40.3 | 51 | 4 | 1 | 0 | 1 / 90 | 63 | 0 | 53 | 0 | 2 | 1337 | 0 |
| C1 | burst 7-10.5 | new-off | 3 | 16.7 | 22 | 45.4 | 57.2 | 5 | 2 | 0 | 4 / 101 | 63 | 0 | 52 | 0 | 0 | 0 | 84 |
| C1 | burst 50-54 | base | 3 | 16.8 | 34 | 63.1 | 134 | 11 | 5 | 2 | 8 / 154 | 240 | 0 | 59 | 0 | - | - | 0 |
| C1 | burst 50-54 | new | 3 | 17.2 | 26.1 | 42.2 | 52.6 | 5 | 1 | 0 | 3 / 103 | 98 | 0 | 31 | 0 | 2 | 2168 | 524 |
| C1 | burst 50-54 | new-off | 3 | 17 | 27.6 | 48.2 | 54.6 | 9 | 1 | 0 | 1 / 95 | 98 | 0 | 31 | 0 | 0 | 0 | 383 |
| C1 | burst 22.6-25 | base | 3 | 16.8 | 34.4 | 48.3 | 88.2 | 8 | 1 | 0 | 4 / 118 | 133 | 0 | 60 | 0 | - | - | 0 |
| C1 | burst 22.6-25 | new | 3 | 16.8 | 27.7 | 36.2 | 37 | 3 | 0 | 0 | 2 / 97 | 51 | 0 | 59 | 0 | 2 | 2073 | 155 |
| C1 | burst 22.6-25 | new-off | 3 | 16.7 | 34 | 41.8 | 42.3 | 7 | 0 | 0 | 2 / 81 | 51 | 0 | 59 | 0 | 0 | 0 | 183 |
| C1 | heavy 60s | base | 3 | 18.5 | 77 | 88 | 253.8 | 530 | 327 | 8 | 19 / 529 | 146262 | 298306 | 107809 | 571 | - | - | 0 |
| C1 | heavy 60s | new | 3 | 16.8 | 71.9 | 83.4 | 459 | 543 | 356 | 6 | 14 / 512 | 158546 | 457134 | 123324 | 568 | 2 | 168300 | 37514 |
| C1 | heavy 60s | new-off | 3 | 17.7 | 79.1 | 95.1 | 263.4 | 525 | 328 | 16 | 34 / 515 | 144857 | 416344 | 109018 | 531 | 0 | 0 | 37537 |
| C1 | cold e24 8.2 | base | 3 | 16.7 | 27.6 | 108.4 | 137.1 | 8 | 7 | 2 | 4 / 111 | 769 | 4177 | 310 | 0 | - | - | 0 |
| C1 | cold e24 8.2 | new | 3 | 16.6 | 33.4 | 129.1 | 136.7 | 10 | 5 | 3 | 4 / 88 | 351 | 3914 | 362 | 0 | 2 | 1165 | 1209 |
| C1 | cold e24 8.2 | new-off | 3 | 16.7 | 30.7 | 149.1 | 219.2 | 7 | 4 | 3 | 3 / 126 | 287 | 3312 | 371 | 0 | 0 | 0 | 1216 |
| C1 | cold heavy 0 | base | 3 | 20.4 | 81.3 | 113.1 | 251.7 | 54 | 36 | 3 | 6 / 597 | 13604 | 37143 | 9636 | 45 | - | - | 0 |
| C1 | cold heavy 0 | new | 3 | 16.7 | 76.5 | 90.7 | 114.3 | 63 | 44 | 1 | 8 / 497 | 15160 | 51251 | 11411 | 44 | 2 | 10688 | 34131 |
| C1 | cold heavy 0 | new-off | 3 | 16.7 | 80.2 | 99 | 131.1 | 55 | 41 | 2 | 6 / 439 | 14030 | 47618 | 10106 | 37 | 0 | 0 | 37077 |
| C1 | seek e24 ->8.7 | base | 3 | 16.6 | 21.1 | 82.2 | 129.5 | 3 | 3 | 1 | 2 / 115 | 303 | 251 | 266 | 0 | - | - | 0 |
| C1 | seek e24 ->8.7 | new | 3 | 16.7 | 21.2 | 75.8 | 110.6 | 3 | 2 | 1 | 1 / 70 | 147 | 17 | 127 | 0 | 2 | 2108 | 240 |
| C1 | seek e24 ->8.7 | new-off | 3 | 16.7 | 21.9 | 53.5 | 99.7 | 2 | 2 | 0 | 1 / 68 | 135 | 2 | 91 | 0 | 0 | 0 | 252 |
| C1 | seek e24 ->52.3 | base | 3 | 16.7 | 38 | 117.3 | 132.2 | 10 | 4 | 2 | 3 / 110 | 361 | 0 | 97 | 0 | - | - | 0 |
| C1 | seek e24 ->52.3 | new | 3 | 16.7 | 28.2 | 48.6 | 77 | 5 | 1 | 0 | 1 / 57 | 125 | 0 | 85 | 0 | 2 | 2672 | 254 |
| C1 | seek e24 ->52.3 | new-off | 3 | 16.7 | 30.8 | 48.4 | 88.6 | 7 | 1 | 0 | 1 / 56 | 126 | 0 | 95 | 0 | 0 | 0 | 332 |
| C1 | seek heavy ->31.7 | base | 3 | 20.6 | 79.9 | 133.8 | 133.8 | 31 | 21 | 1 | 3 / 92 | 7903 | 23174 | 5688 | 37 | - | - | 0 |
| C1 | seek heavy ->31.7 | new | 3 | 17.2 | 68.1 | 74.8 | 74.8 | 35 | 24 | 0 | 0 / 0 | 9406 | 33190 | 6887 | 42 | 2 | 8304 | 33662 |
| C1 | seek heavy ->31.7 | new-off | 3 | 22.1 | 78.5 | 102.8 | 147.9 | 32 | 19 | 1 | 2 / 100 | 9301 | 28148 | 6500 | 45 | 0 | 0 | 33665 |
| C1 | seek heavy ->32.3 | base | 3 | 32.4 | 75.9 | 138.4 | 138.4 | 39 | 26 | 1 | 1 / 95 | 10462 | 27457 | 7696 | 44 | - | - | 0 |
| C1 | seek heavy ->32.3 | new | 3 | 31.8 | 72.2 | 83.9 | 83.9 | 40 | 30 | 0 | 1 / 75 | 11936 | 36946 | 9232 | 43 | 2 | 6192 | 29979 |
| C1 | seek heavy ->32.3 | new-off | 3 | 33.7 | 72.8 | 75.4 | 75.4 | 43 | 26 | 0 | 0 / 0 | 11212 | 34618 | 8541 | 47 | 0 | 0 | 29920 |
| C2 | burst 7-10.5 | base | 3 | 36.1 | 153.9 | 249 | 249 | 41 | 17 | 10 | 23 / 316 | 224 | 1070 | 329 | 51 | - | - | 0 |
| C1 | synth 60s | base | 3 | 16.7 | 33.5 | 57.1 | 154.3 | 172 | 45 | 6 | 19 / 340 | 14264 | 6648 | 11710 | 1259 | - | - | 0 |
| C1 | synth 60s | new | 3 | 16.7 | 52.1 | 109.9 | 145.2 | 389 | 154 | 38 | 122 / 429 | 11031 | 285 | 6927 | 115 | 2 | 44578 | 9482 |
| C1 | synth 60s | new-off | 3 | 16.7 | 34.8 | 74 | 139.8 | 187 | 66 | 6 | 27 / 371 | 11422 | 832 | 7665 | 1207 | 0 | 0 | 9494 |
| C1 | cold synth 0 | base | 3 | 16.9 | 75.1 | 119.5 | 172.9 | 46 | 30 | 6 | 11 / 399 | 7406 | 6360 | 11971 | 59 | - | - | 0 |
| C1 | cold synth 0 | new | 3 | 16.8 | 59.9 | 75.2 | 85.1 | 54 | 31 | 0 | 28 / 479 | 248 | 0 | 4 | 0 | 2 | 8146 | 10506 |
| C1 | cold synth 0 | new-off | 3 | 16.8 | 45.1 | 71.1 | 90.8 | 30 | 15 | 0 | 13 / 542 | 244 | 0 | 0 | 103 | 0 | 0 | 10536 |
| C1 | seek synth ->31.7 | base | 3 | 19.6 | 32.9 | 43 | 92.3 | 7 | 1 | 0 | 1 / 92 | 66 | 0 | 0 | 80 | - | - | 0 |
| C1 | seek synth ->31.7 | new | 3 | 16.8 | 74.3 | 105 | 114.5 | 15 | 10 | 5 | 3 / 62 | 2083 | 3107 | 4016 | 49 | 2 | 7099 | 12156 |
| C1 | seek synth ->31.7 | new-off | 3 | 20 | 81.7 | 110 | 110 | 31 | 18 | 1 | 0 / 0 | 2328 | 16985 | 5548 | 38 | 0 | 0 | 12378 |
| C1 | seek synth ->32.3 | base | 3 | 19.5 | 42.1 | 73.9 | 84.1 | 18 | 6 | 0 | 0 / 0 | 2163 | 4976 | 3952 | 100 | - | - | 0 |
| C1 | seek synth ->32.3 | new | 3 | 17 | 48.5 | 89 | 97.9 | 15 | 6 | 0 | 1 / 55 | 2209 | 4188 | 3004 | 81 | 2 | 5104 | 11169 |
| C1 | seek synth ->32.3 | new-off | 3 | 18.6 | 48.5 | 79.6 | 118.1 | 15 | 7 | 1 | 2 / 79 | 2121 | 3695 | 2856 | 94 | 0 | 0 | 11063 |
| C2 | burst 7-10.5 | new | 3 | 23.6 | 105 | 148.6 | 229.2 | 31 | 12 | 6 | 14 / 275 | 69 | 0 | 48 | 63 | 2 | 1334 | 1337 |
| C2 | burst 7-10.5 | new-off | 3 | 45.8 | 158.6 | 200.9 | 200.9 | 44 | 25 | 9 | 25 / 309 | 252 | 2310 | 283 | 22 | 0 | 0 | 1334 |
| C2 | burst 50-54 | base | 3 | 57 | 322.3 | 354.9 | 354.9 | 36 | 24 | 14 | 29 / 439 | 314 | 3318 | 546 | 31 | - | - | 0 |
| C2 | burst 50-54 | new | 3 | 102.1 | 302.1 | 385.7 | 385.7 | 31 | 27 | 18 | 32 / 357 | 244 | 3470 | 279 | 24 | 2 | 0 | 1307 |
| C2 | burst 50-54 | new-off | 3 | 68.3 | 258.9 | 401.7 | 401.7 | 37 | 31 | 14 | 31 / 410 | 248 | 3970 | 518 | 28 | 0 | 0 | 1086 |
| C2 | burst 22.6-25 | base | 3 | 43 | 258.1 | 535.9 | 535.9 | 25 | 15 | 5 | 22 / 409 | 119 | 115 | 201 | 30 | - | - | 0 |
| C2 | burst 22.6-25 | new | 3 | 88.3 | 299.8 | 336.1 | 336.1 | 17 | 12 | 10 | 19 / 352 | 93 | 1221 | 109 | 10 | 2 | 0 | 1679 |
| C2 | burst 22.6-25 | new-off | 3 | 104.3 | 199.3 | 349.5 | 349.5 | 21 | 19 | 11 | 22 / 286 | 163 | 1858 | 173 | 9 | 0 | 0 | 1767 |
| C2 | synth 14-34 | base | 3 | 16.6 | 89.3 | 157.8 | 246.5 | 64 | 63 | 36 | 65 / 1589 | 2106 | 36276 | 3918 | 43 | - | - | 0 |
| C2 | synth 14-34 | new | 3 | 16.7 | 108 | 159.2 | 194.3 | 64 | 55 | 43 | 57 / 1549 | 2574 | 50408 | 4832 | 26 | 2 | 13844 | 9550 |
| C2 | synth 14-34 | new-off | 3 | 14.5 | 103.6 | 169.5 | 306 | 57 | 53 | 41 | 60 / 1657 | 2276 | 46355 | 3936 | 23 | 0 | 0 | 9555 |
| C2 | cold e24 8.2 | base | 3 | 52.8 | 280.4 | 523.8 | 523.8 | 27 | 24 | 10 | 24 / 455 | 185 | 1346 | 470 | 6 | - | - | 0 |
| C2 | cold e24 8.2 | new | 3 | 51.9 | 207 | 437.1 | 437.1 | 23 | 23 | 13 | 22 / 352 | 159 | 1090 | 603 | 4 | 2 | 0 | 1145 |
| C2 | cold e24 8.2 | new-off | 3 | 16.9 | 143 | 328.1 | 328.1 | 17 | 16 | 10 | 17 / 317 | 116 | 553 | 398 | 1 | 0 | 0 | 0 |
| C2 | cold synth 0 | base | 3 | 15.8 | 155.9 | 288.6 | 345.2 | 25 | 24 | 21 | 31 / 1388 | 1376 | 18087 | 2524 | 0 | - | - | 0 |
| C2 | cold synth 0 | new | 3 | 16.2 | 167.1 | 295 | 414.8 | 24 | 20 | 17 | 26 / 1498 | 782 | 12265 | 1059 | 0 | 2 | 4018 | 12621 |
| C2 | cold synth 0 | new-off | 3 | 14.5 | 170.7 | 244.6 | 332.7 | 26 | 23 | 20 | 29 / 1584 | 1010 | 20453 | 1618 | 0 | 0 | 0 | 14798 |
| C2 | seek e24 ->8.7 | base | 3 | 38.8 | 144.4 | 247.8 | 247.8 | 33 | 20 | 5 | 18 / 174 | 223 | 191 | 692 | 30 | - | - | 0 |
| C2 | seek e24 ->8.7 | new | 3 | 34.5 | 145.3 | 273 | 273 | 38 | 13 | 5 | 12 / 213 | 178 | 160 | 441 | 36 | 2 | 0 | 1167 |
| C2 | seek e24 ->8.7 | new-off | 3 | 37.7 | 149.3 | 252.8 | 252.8 | 33 | 17 | 6 | 15 / 178 | 164 | 411 | 429 | 28 | 0 | 0 | 1162 |
| C2 | seek e24 ->52.3 | base | 3 | 17.7 | 232.6 | 496.1 | 496.1 | 18 | 11 | 5 | 12 / 392 | 271 | 2838 | 647 | 31 | - | - | 0 |
| C2 | seek e24 ->52.3 | new | 3 | 17.8 | 233.5 | 300 | 300 | 21 | 15 | 8 | 16 / 193 | 201 | 2424 | 623 | 16 | 2 | 0 | 1199 |
| C2 | seek e24 ->52.3 | new-off | 3 | 17.8 | 281.5 | 349.1 | 349.1 | 20 | 15 | 7 | 13 / 197 | 204 | 2044 | 529 | 23 | 0 | 0 | 1065 |
| C2 | seek synth ->31.7 | base | 3 | 18.3 | 174.7 | 181.4 | 181.4 | 17 | 16 | 12 | 18 / 124 | 742 | 13207 | 1280 | 13 | - | - | 0 |
| C2 | seek synth ->31.7 | new | 3 | 16.3 | 154.9 | 184.6 | 184.6 | 17 | 16 | 13 | 17 / 104 | 687 | 18553 | 1217 | 6 | 2 | 0 | 7368 |
| C2 | seek synth ->31.7 | new-off | 3 | 16.5 | 158 | 167.2 | 167.2 | 17 | 16 | 13 | 14 / 110 | 790 | 18530 | 1553 | 8 | 0 | 0 | 6868 |
| C2 | seek synth ->32.3 | base | 3 | 22.2 | 165.4 | 184.1 | 184.1 | 20 | 19 | 16 | 22 / 115 | 959 | 15381 | 1605 | 10 | - | - | 0 |
| C2 | seek synth ->32.3 | new | 3 | 21 | 169.3 | 182.8 | 182.8 | 20 | 19 | 16 | 18 / 116 | 1074 | 19941 | 2011 | 8 | 2 | 0 | 5278 |
| C2 | seek synth ->32.3 | new-off | 3 | 24.6 | 159.7 | 171.1 | 171.1 | 21 | 19 | 16 | 18 / 110 | 1024 | 19854 | 2249 | 9 | 0 | 0 | 4297 |

C3 is partial (11 of 30 groups; the run was stopped on request): burst 50-54 base/new/new-off p95 314/322/346 ms, `synth 14-34` p95 99 / 110. **Not measured**: C4-C6 (rate 6, cores 2/4; rate 1 with cores 2), `heavy` stress script beyond C1 (its rows are in the jsonl as `heavy ...`), a real phone. Rates 4 and 6 on a worker spin loop: the main thread slows 2.3x / 3.5x, **the Worker does not slow at all** (61 / 55 / 58 ms), so every throttled `new` row flatters the pool; `new-off` is the pessimistic bound for a really weak CPU.

What the numbers say:
- Real-file bursts, no throttle (C1): clear win. 50-54 s: p95 34 -> 26, p99 63 -> 42, max 134 -> 53, frames over 100 ms 2 -> 0; 22.6-25 s: max 88 -> 37; seek into 52.3 s: p99 117 -> 49, >100 ms 2 -> 0, sprite misses 361 -> 125. Items deferred stay 0 in both builds. The gain is mostly the planner (new-off has it too: 54 / 55 / 88 max); workers add little in this rig (22.6-25 s p95 28 vs 34).
- **Synthetic report pattern (C1, 60 s): the new build is worse with workers on**: p95 33.5 -> 52.1, p99 57 -> 110, frames over 50 ms 45 -> 154, over 100 ms 6 -> 38, long tasks 19 -> 122; `new-off` is about base (p95 34.8, >100 6). Shed frames drop 1259 -> 115 and deferred 6648 -> 285, so the planner does what it was built for, but the frames got later.
- Throttled 4x (C2, C3): no gain, often worse. p95 3-4 times the unthrottled value for both builds; `new` defers 5-10x more items on the burst windows (1221 vs 115) because it keeps a larger plan (planQueued 1,700 at the end) while base builds on demand; the worker (unthrottled here) does not rescue it. Cold start and seek: within noise of base, p99 300-440 ms in both.
- Cold start e24 8.2 s (C1): no change (p99 108 / 129 / 149 ms); the first second is still built from nothing.
- Pixels unchanged: `parity.mjs` 11/11 identical (workers off vs auto); `fidelity.mjs` mean 0.068 on both builds.
- Not improved: the first frames after start/seek, anything under CPU throttling, the synthetic pattern with workers.

Suspected remaining bottlenecks (evidence only, not profiled with the CPU profiler, nothing fixed):
1. **Worker result hand-off and over-planning** (`src/canvas/workers/pool.ts` `built` hook -> `Lookahead.ensurePool` -> `CanvasPath.cache.put`; `src/canvas/warm/planner.ts`). On `synth 60s` the workers delivered 44,578 sprites for a 26,420-event script (1.7 per event) while draw-time misses stayed at 11,031, and `planQueued` peaked at 9,482 with 122 long tasks (max 429 ms) against 19 for base: sprites are built that are not used (evicted from the 96 MB LRU before their event, or planned for samples that never get drawn) and each arriving bitmap costs main-thread time between frames. Check `workerBuilt` vs hits, and batch/limit bitmap delivery per frame.
2. **Plan size is not tied to the device** (`warm/budget.ts`, `planner.ts`): under throttle the planner holds 1,200-1,700 queued items at the end of a window and the build still falls behind, so the frames that need them skip (deferred 1,221 vs 115). The horizon (5 s) and queue should shrink when frames are late.
3. **Cold first second** (`Lookahead.run` runs only after the first render; the pool is created lazily in `ensurePool`, the first slice runs on the main thread): cold start p99 unchanged.
4. Draw-time `bake()`/builds at the burst frame itself remain (misses 125-350 per window) under the 8/16 ms budget.

Caveats: software GL (no GPU, fill is more expensive than on an RTX 4060, builds relatively cheaper), 4 shared sandbox cores with other jobs running (the rig is noisy, about +-15 %), CDP throttling does not apply to Workers, `synth` is a model of the report, not the user's file.
