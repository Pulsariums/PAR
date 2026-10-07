# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Heavy scenes: canvas path for simple per-glyph events (karaoke particles). New options `renderMode` (`'auto'` default, `'dom'`, `'canvas'`) and `spriteCacheMB` (default 96). Qualifying events (one text fragment without whitespace, no `\k`, drawings, `\frx/\fry`, `\fax/\fay`, `\be`, `\u/\s`, `\r`, BorderStyle 3 or collision stacking) are rasterised once per sprite (glyph, border, shadow, blur; single-colour sprites as a white mask tinted per colour; keys quantised: size 6 %, animated blur 20 %, animated colour 5 bit), cached under a byte cap (LRU) and composited per frame with transform, opacity and clip (rect clips with `rect()`, complex vector clips baked into a clip-sized bitmap); the sprites of events about to start are built ahead in spare frame time. `'auto'` switches a line at its first frame when the scene is heavy and keeps its path for its life; DOM remains for everything else and when the browser has no `ctx.filter` / `letterSpacing`. Level of detail: opacity < 1/255 not drawn, blur below 0.35 device px drawn sharp, per-frame sprite build budget (8 ms blurs dropped, 16 ms deferred) with a follow-up draw so a paused frame is completed. Fidelity: whole-frame mean difference to DOM 0.01 to 0.15 on particle fixtures and 0.03 to 0.15 on the real e24 at 1000+ particles.
- `getMetrics().render`: lines per path, `drawn` / `fillMpx` of the last frame (also in the Studio Metrics panel), canvas runs, sprite cache (count, bytes, hits, misses, prewarmed, evictions), `detailDropped`, `skipped`, `frameMs` p50/p95 of the draw call.
- `tools/bench`: `burst.mjs` (play into a burst: deferred items, blurs dropped, frame gaps), `run.mjs` (heavy-scene frame time, Chrome trace split), `seek.mjs` (seek storms, seek latency), `fidelity.mjs` / `fidelity-real.mjs` (DOM vs canvas pixel difference). docs/performance.md.
- Site: quick converter card at the top (`site/src/convert`, nav link "Convert"): drop or pick several files, type detected by content; ASS to XPAR (lossless, optional SHA-256 round-trip verify, default on under 20 MB) or PAR (lossy, fps presets or custom), XPAR to the byte-exact ASS (checked against the stored SHA-256), PAR to the baked ASS with a lossy notice. One Worker per file with progress and cancel, a queue with per-file rows, sizes, ratio and time. TR / RU / EN.
- Site: new Studio section (`site/src/studio`): video player with a Videos / Subtitles / Fonts media shelf (file picker and drag and drop, independent video and subtitle selection, persistent font library, missing-font prompt) and Export PAR / Export XPAR with progress, cancel and size ratio. It is the one player of the site (a former separate Lab section was merged into it; `#lab` and `#lab-root` links redirect to `#studio-root`): works without a video (test card), seek bar with time labels, frame step at the video fps, keys Space / K, arrows, `,` `.`, J / L, `[` `]`; an Examples menu (playground presets, 10 / 100 MB stress-script generator); ONE Sizes and export panel (ASS size next to exact or estimated XPAR and PAR sizes at the chosen fps, progress, cancel); an Advanced row (render mode `auto` / `dom` / `canvas`, render FPS, video FPS, time offset); collapsible Metrics (including `getMetrics().render`; measured FPS is computed only while playing and shows an em dash otherwise) and Virtual-vs-real layout panels with a frame overlay; a "Heavy scene" hint. Always the windowed source and the canvas particle path.
- Default virtual size: new `defaultLayout` option (`'1080p'` default = 1920x1080, `'720p'` = 1280x720, `'libass'` = 384x288, or `{ width, height }`), used when a script has no PlayRes. Resolution order: `layout` option, script PlayResX + PlayResY, one side only (other side from the region's aspect ratio, 16:9 without a region; libass 4:3 rule with `defaultLayout: 'libass'`), `defaultLayout`. `getMetrics()` gains `layoutSize`, `regionSize`, `scale`, `layoutSource`, `layoutDerived`. `resolveLayout`, `writtenPlayRes`, `LAYOUT_1080P`, `LAYOUT_720P`, `LAYOUT_LIBASS` exported.
- Windowed subtitle sources: `subtitle` / `setSubtitle` accept a `SubtitleSource` (sliding window of events in memory, `windowSeconds`, slice-wise read-ahead, stale reads cancelled, nothing drawn for unloaded times); `getSourceStats()`. New entries `pulsar-ass-renderer/source` (`fromAssFile`, `fromXpar`, `fromPar`, `openSource`, `openSourceInWorker`) and `pulsar-ass-renderer/worker` (module Worker). `fromAssText` and the `SubtitleSource` types are in the main entry. `indexAss` gains `onProgress` / `signal` and records the `[Fonts]` byte range; `estimateXpar` added next to `estimatePar`.
- Fonts of a windowed script: styles give the starting set, fonts from overrides are added as windows arrive (`FontManager.extendUsage`).
- Site: the "Time boundaries" preset. TR / RU / EN.
- docs/timing.md and README sections on the default layout rule, frame times, big files and the Studio.

### Fixed
- Canvas path in bursts (1,000+ events starting within a few frames): the build-ahead is now a pump between frames (message-task slices sized from recent frame cost, 5 s ahead, nearest start first; it also looks ahead while no canvas line is on screen), keeps its progress per event, and samples the frames that will actually be drawn (it used to sample from the event start and miss about a quarter of the sprites). On the real file: items deferred in a burst 1861 / 2859 / 2312 -> 0 / 0 / 87, sprite builds at draw time -4x. A vector clip that is an axis-aligned rectangle (`m x y l ...`) is applied as a rect clip; baking a clip into a bitmap is limited to events that stay put and last 200 ms or more (92-98 % of draw-time sprite builds in the heavy windows were per-frame re-baking of 1-2 frame clipped shards). `\fax` / `\fay` events are drawn on the canvas (they used to force the DOM path). Sprites are cut to the measured ink instead of the whole line box (identical pixels, 15-22 % fewer). See docs/performance.md.
- Site: the sticky header no longer covers anchored sections (its height is tracked in `--top-h`); on phones the Studio shows the player, the shelf tabs, then the panels.
- Fast scrubbing on big windowed files (e24.par, 112k events): the chunk cache held 8 chunks while a time window of a file-ordered script touches dozens, so every window re-decoded (0.6 s per 0.5 s window); it is now a 64 MB LRU by bytes. `readWindow(t0, t1, signal)` now honours the abort signal between chunks and yields to the event loop before decoding a cold chunk, so a Worker sees `cancel` messages instead of working through every stale read first (a 40-seek storm cost 160 s of decoding in the Worker, 3.4 s now). A read the playhead left is aborted; the last seek wins.
- `clipPathCss` shares its geometry with the canvas path (`clipShape`) and memoises vector clip geometry per clip (the same polygon was re-parsed on every frame).

### Changed
- BREAKING (visual): scripts without any PlayRes now lay out in 1920x1080 instead of 384x288 (`defaultLayout: 'libass'` restores the old behaviour). Scripts with PlayRes are unchanged.
- BREAKING (visual): a missing `ScaledBorderAndShadow` is now `no` (libass), `yes` only when the `[V4+ Styles]` Format line is non-standard; `parse_bool` rules ("yes" prefix or number > 0). With `no`, border/shadow scale by layout height / storage height (script `LayoutResY`, else the video's pixel height; unknown => no-op, as in libass without a storage size) instead of the screen-pixel rule; `\blur` scales by the same ratio (`blurScale`). `stageTransform` gains a `storage` argument and returns `blurScale`.
- libass parity, `\t`: `t2` = 0 spans the event, `pow` for accel <= 0, `\b \i \u \s \fn \r` inside `\t` apply unconditionally (preflight font scan and `.par` baking follow). Karaoke: `\k` without argument is 100 cs; continuation text of a syllable no longer splits it proportionally but flips at the syllable end. See docs/parity.md.
- libass parity, collisions: `\org` and any `\t` exempt a line from stacking, middle aligned lines (`\an4-6`) stack downwards, the outline is part of the collision rectangle (new `layout/Stacking.ts`, `PreparedLine.stacks`).
- libass parity, text: spaces at the start/end of lines and around `\N` are trimmed, TAB is a space, `\{` / `\}` are literal braces (linear block scanner `parser/textBlocks.ts`, also used by the preflight scan and the text model), lines break only at U+0020, `Kerning:` header (default off, `font-kerning: none`). `ScriptInfo.kerning`, `PreparedLine.kerning` added.
- Parser robustness: the event text scanner is linear (no regex split, `push` instead of `concat`): `{` x 80 000 took 6 s and `{\b1}` x 80 000 took 13 s before, now tens of ms. Drawings: lazy tokenizer, at most 100 000 points (`MAX_DRAWING_POINTS`), coordinates clamped to +-1e7 (`m 1e999` no longer yields NaN paths).
- libass parity, small rules: `\fsc` (both scales, was mis-read as `\fs`), `\move` t1 > t2 swap, invalid first `\an` takes the slot (`LineTags.an` may be `null`), `\a4`/`\a8` = `\a5`, `\b` 0/1/>=100, `\i \u \s` 0/1, `\fn0`, invalid `\q` (`LineTags.q` may be `null`), negative style Spacing = 0, unknown style falls back to Default or the built-in Arial 18 instead of the first style, trailing whitespace of Text dropped.
- Visibility is half-open on integer milliseconds: `startMs <= t < endMs` (a line is gone at its end instant, the next one starting there is shown; end <= start is never visible). Media time converts with `Math.round(t * 1000)`; with `videoFps` the time snaps to the frame start `n / fps` (NTSC rates as exact fractions). `\fad` / `\t` / `\move` / karaoke use the same ms base. Previously float seconds were compared and a line ending exactly where another started could overlap or leave a gap on a frame.
- `snapToFrame` uses exact fractions for 23.976 / 29.97 / 59.94.

### Added (fonts)
- Font providers: `fontProviders` / `providerTimeout` options, `FontProvider` interface (`has`, `get`, `subscribe`), `createUrlProvider` (URL map or manifest), `refreshProviders()`. Resolution order: user > embedded > `fontMap` > providers > local > system > generic.
- Preflight: `par.preflight(text?)`, `preflightScript(input, options)` (also `PARRenderer.preflightScript`): streaming scan (strings, line iterables, `linesFromChunks`), `usedFonts` input, `{ ok, resolved, missing, synthetic, providerHits, missingGlyphs, warnings, stats }`; `usedCharacters()`.
- Missing fonts: `onMissingFonts(report, ctrl)` ('continue' | 'wait' | Promise), `par.on('missingfonts')`, `continueWithMissing()`, `missingFonts`; `createMissingFontsPrompt()` helper (accessible, no CSS).
- Glyph coverage: `cmap` (formats 4, 12) read for every parsed face (`FaceInfo.coverage`, `hasCp`, `readCmap`), `missingGlyphs` in preflight.
- `pulsar-ass-renderer/fontlib`: IndexedDB font library (dedupe, name / alias index, quota and persistence helpers, zip export, repair, `asProvider()`), script badges, Unicode block helpers.
- Playground: font library section (list, search, family grouping, bulk delete, names, previews with tofu boxes, paged character grid, used-character check), missing-font prompt, `Fonts: font library` preset; TR / RU / EN.
- docs/host-integration.md.
- Fonts: embedded `[Fonts]` decoding, `addFont`/`addFonts`/`removeFont`/`listFonts`, `fonts`/`useLocalFonts`/`embeddedFonts` options, `getFontReport()`, `ready`, `onFontsChange`, content-addressed ref-counted registry, name-table parsing (TTF/OTF/TTC/WOFF/WOFF2), zip input, Local Font Access, playground Fonts tab and two font presets.

### Changed
- `\\fs` to CSS size now uses real font metrics (`unitsPerEm / (winAscent + winDescent)`, as libass) instead of a fixed 0.9; 0.9 remains the fallback. Bundle grows to about 22 kB gzipped.

### Added (earlier)
- Static GitHub Pages site (`site/`, Vite): live hero, playground with test card / video file / video URL,
  one preset per feature, feature test matrix, option controls, metrics panel and copyable `create(...)` snippet. TR / RU / EN UI.
- README in English, Turkish and Russian; CONTRIBUTING.md; SECURITY.md; animated SVG banner; favicon and social preview.
- GitHub Actions: `ci.yml` (typecheck, test, build on PRs) and `pages.yml` (deploy to Pages on `main`).

### Changed
- The old `demo/` page is replaced by `site/`; `npm run build:demo` is now `npm run build:site`.

## [0.1.0] - 2026-10-05

First standalone release of PAR (Pulsar ASS Renderer), extracted from the
`PAR-pocket` engine of Pulsar Editor and rewritten as an independent library.

### Added
- Full `.ass` / `.ssa` file parser: `[Script Info]` (PlayResX/Y with libass fallbacks,
  LayoutResX/Y, ScaledBorderAndShadow, WrapStyle), `[V4+ Styles]` / `[V4 Styles]` and
  `[Events]` driven by their `Format:` lines; BOM, CRLF and missing sections handled;
  `Comment:` lines skipped; deterministic, index-based event ids.
- Parenthesis-aware override lexer; ordered tag operations so `\t` and static tags
  interact exactly in source order (libass semantics).
- `\t` with nested tags, optional times and acceleration, including rect `\clip` animation.
- Line-level tag precedence per libass (first `\pos`/`\move`, `\org`, `\an`/`\a`,
  `\fad`/`\fade`; last `\clip`/`\iclip`, `\q`).
- Karaoke `\k \K \kf \ko \kt` timing and rendering (colour switch, left-to-right sweep, outline reveal).
- DOM/SVG/CSS renderer: one CSS-scaled stage per overlay, line DOM built once and only
  animated properties updated per frame, clip-path clips, SVG drawings, BorderStyle 3,
  collision stacking for unpositioned lines.
- Plug-and-play API: `create({ video | container, subtitle, region, layout, fps, videoFps, clock, timeOffset, fontMap })`.
- Region modes: letterbox-aware video content rect (`object-fit` contain/cover/fill/none/scale-down),
  whole container, or explicit rect. Render FPS `'auto'` (requestVideoFrameCallback / rAF) or 10..200.
- ESM, CJS and IIFE (`window.PAR`) builds with TypeScript declarations; demo page.

### Fixed (compared to PAR-pocket)
- `\t` parsing with nested parentheses and acceleration.
- Vector drawings rendering empty.
- DOM rebuilt every frame; random line ids; comment lines rendered; video fps used as render fps.
- README claims that were not true (GPU acceleration, font crawler).
