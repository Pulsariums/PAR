# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Default virtual size: new `defaultLayout` option (`'1080p'` default = 1920x1080, `'720p'` = 1280x720, `'libass'` = 384x288, or `{ width, height }`), used when a script has no PlayRes. Resolution order: `layout` option, script PlayResX + PlayResY, one side only (other side from the region's aspect ratio, 16:9 without a region; libass 4:3 rule with `defaultLayout: 'libass'`), `defaultLayout`. `getMetrics()` gains `layoutSize`, `regionSize`, `scale`, `layoutSource`, `layoutDerived`. `resolveLayout`, `writtenPlayRes`, `LAYOUT_1080P`, `LAYOUT_720P`, `LAYOUT_LIBASS` exported.
- Windowed subtitle sources: `subtitle` / `setSubtitle` accept a `SubtitleSource` (sliding window of events in memory, `windowSeconds`, slice-wise read-ahead, stale reads cancelled, nothing drawn for unloaded times); `getSourceStats()`. New entries `pulsar-ass-renderer/source` (`fromAssFile`, `fromXpar`, `fromPar`, `openSource`, `openSourceInWorker`) and `pulsar-ass-renderer/worker` (module Worker). `fromAssText` and the `SubtitleSource` types are in the main entry. `indexAss` gains `onProgress` / `signal` and records the `[Fonts]` byte range; `estimateXpar` added next to `estimatePar`.
- Fonts of a windowed script: styles give the starting set, fonts from overrides are added as windows arrive (`FontManager.extendUsage`).
- Site: Lab section (open .ass / .ssa / .xpar / .par, sizes with XPAR and PAR computed or estimated, virtual vs real panel with overlay, timeline player with render fps and video fps, keyboard shortcuts, window stats) and the "Time boundaries" preset. TR / RU / EN.
- docs/timing.md and README sections on the default layout rule, frame times, big files and the Lab.

### Changed
- BREAKING (visual): scripts without any PlayRes now lay out in 1920x1080 instead of 384x288 (`defaultLayout: 'libass'` restores the old behaviour). Scripts with PlayRes are unchanged.
- BREAKING (visual): a missing `ScaledBorderAndShadow` is now `no` (libass), `yes` only when the `[V4+ Styles]` Format line is non-standard; `parse_bool` rules ("yes" prefix or number > 0). With `no`, border/shadow scale by layout height / storage height (script `LayoutResY`, else the video's pixel height; unknown => no-op, as in libass without a storage size) instead of the screen-pixel rule; `\blur` scales by the same ratio (`blurScale`). `stageTransform` gains a `storage` argument and returns `blurScale`.
- libass parity, `\t`: `t2` = 0 spans the event, `pow` for accel <= 0, `\b \i \u \s \fn \r` inside `\t` apply unconditionally (preflight font scan and `.par` baking follow). Karaoke: `\k` without argument is 100 cs; continuation text of a syllable no longer splits it proportionally but flips at the syllable end. See docs/parity.md.
- libass parity, collisions: `\org` and any `\t` exempt a line from stacking, middle aligned lines (`\an4-6`) stack downwards, the outline is part of the collision rectangle (new `layout/Stacking.ts`, `PreparedLine.stacks`).
- libass parity, text: spaces at the start/end of lines and around `\N` are trimmed, TAB is a space, `\{` / `\}` are literal braces (linear block scanner `parser/textBlocks.ts`, also used by the preflight scan and the text model), lines break only at U+0020, `Kerning:` header (default off, `font-kerning: none`). `ScriptInfo.kerning`, `PreparedLine.kerning` added.
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
