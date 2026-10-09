# Performance report (`par-perf/1`)

The Lab view of the site has a **Performance report** fold. It records the player for 15 to 120 s (it plays by itself, and pauses again afterwards if it started the playback), then gives:

* a **summary** of about ten lines to paste into a chat, and
* the full report as **JSON** (copy or download).

Nothing is sent anywhere. The report has no file name and no subtitle text: only the kind of file (`ass` / `xpar` / `par`), its size, event count and duration.

"Find the busiest moments" reads the subtitle window by window (through its Worker, so big files are fine) and lists up to five moments with the most events on screen at once; clicking one seeks to 2 s before it and starts the recording. That is the one-click stress test: the same moments on every machine, so reports compare.

## Reading a report

* **Frame gap** is the time between two display frames (rAF), the thing a viewer feels. 16.7 ms is 60 Hz. `over 33 / 50 / 100` count the frames that took longer than 2, 3 and 6 display frames. A smooth run has a p99 within a frame or two of the p50.
* **Long tasks** (Chromium only) are main-thread tasks over 50 ms. Many long tasks with small gaps in the same stretch means the page was busy; big gaps without long tasks means the browser's raster / compositor was (typically a machine without GPU raster).
* **GPU / `[SOFTWARE rendering]`**: the WebGL renderer name. SwiftShader, llvmpipe and similar run on the CPU: the browser is not using a GPU and fill-heavy scenes cost far more. Read such reports as the worst case.
* **Canvas path**: `lines` events on screen, `drawn` items the canvas path drew, `fill` the pixels those draws covered (megapixels), `draw call p95` the renderer's own timing of one draw. `shed` frames are frames where PAR left the faintest items out because frames were running late (see docs/performance.md); `sprite misses` are sprites built while drawing (they cost frame time), `skipped` items not drawn because their sprite was not ready, `blurs dropped` blurs left out under the build budget.
* **Worst frames**: the 20 slowest frames at least 300 ms apart (one stutter is one entry), with the subtitle time, so a bad second can be found in the file.
* **Not playing the whole time**: the run included a pause; the averages then mix paused and playing frames.
* **Diagnostics**: when present, the `diagnostics` section groups nearby late frames into hotspots and gives a best-effort cause. `confidence` describes how strongly the measured evidence supports that cause; it is not a guarantee. The frame budget is derived from the selected render/video fps.
* **Hotspot evidence**: `gapMs` is the observed frame gap, `budgetMs` is the expected frame interval, `renderMs` is the renderer timing proxy, `longTaskMs` is overlapping main-thread long-task time, `fillMpx` is canvas fill volume, `compositeMs` is compositor time, `spriteMisses` is sprite work during drawing, `pending` and `deficitMs` describe look-ahead pressure, and `sourceLoading` / `decodeMs` describe source pressure.
* **Cause labels**: `main-thread/dom`, `canvas/fill/composite`, `sprite-build/cache`, `source/decode/window`, `worker/lookahead`, and `scheduler/unknown` are diagnostic buckets for triage, not proof of a single bottleneck. A browser without long-task support or with unavailable renderer timings may leave evidence at zero.

## JSON schema

```
schema        "par-perf/1"  (bumped when a field changes meaning)
createdAt     ISO time
env           userAgent, platform, cores, memoryGB, dpr, screen, viewport, gpu, softwareGpu, longTasks (supported)
setup         parVersion, renderMode, fps, videoFps, layout, region, hasVideo
file          { kind, bytes, events, durationS } | null
run           durationS, startMediaS, endMediaS, playing, seeks, heapStartMB, heapEndMB
frames        count, fpsAvg, gap {p50,p90,p95,p99,max}, over33, over50, over100, longTasks {supported,count,totalMs,maxMs}
render        lines/drawn/fillMpx {p50,max}, drawMsP95, shedFrames, shedItemsMax, spriteMisses, skipped, detailDropped
seconds[]     { sec, frames, gapP95, gapMax, lines, drawn, fillMpx, misses }   one row per second of the run
worst[]       { at (ms into the run), media (s), gap, lines, drawn, fillMpx, shed }
diagnostics   { schema "par-perf-diagnostics/1", budgetMs, hotspotCount, longTaskOverlapMs,
                hotspots[], limitations[] }                                  optional
hotspots[]    { at, media, durationMs, frames, cause, confidence, evidence }
evidence      { gapMs, budgetMs, renderMs, longTaskMs, fillMpx, compositeMs,
                spriteMisses, pending, deficitMs, sourceLoading, decodeMs }
```

`diagnostics` is additive to `par-perf/1`; consumers that do not understand it can ignore the section. `limitations` records missing measurements or caveats for the run. The report remains local-only and contains no file name or subtitle text.

Code: `site/src/studio/perf/` (`recorder.ts` collects frames, `report.ts` builds the report and the summary, `scan.ts` finds busy moments, `ui.ts` is the fold). Tests: `test/perf-report.test.ts`.
