<div align="center">

**English** · [Türkçe](README.tr.md) · [Русский](README.ru.md)

<img src="assets/banner.svg" alt="PAR - Pulsar ASS Renderer: an animated karaoke sweep over the project name" width="100%" />

<p>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/Pulsariums/PAR?color=5b3df5" /></a>
  <a href="https://github.com/Pulsariums/PAR/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Pulsariums/PAR/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/Pulsariums/PAR/actions/workflows/pages.yml"><img alt="Pages" src="https://github.com/Pulsariums/PAR/actions/workflows/pages.yml/badge.svg" /></a>
  <img alt="Version" src="https://img.shields.io/github/package-json/v/Pulsariums/PAR?color=5b3df5" />
  <img alt="Size: about 30 kB gzipped" src="https://img.shields.io/badge/gzip-~30%20kB-5b3df5" />
  <img alt="Zero dependencies" src="https://img.shields.io/badge/dependencies-0-brightgreen" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-typed-3178c6?logo=typescript&logoColor=white" />
</p>

### [▶ Live demo and playground](https://pulsariums.github.io/PAR/)

**Dependency-free ASS/SSA subtitle renderer for the browser. DOM + SVG + CSS, no WebAssembly.**

</div>

PAR (Pulsar ASS Renderer) draws Advanced SubStation Alpha (`.ass`) and SubStation Alpha (`.ssa`) subtitles on top of a
`<video>` or any container. Give it the video element and the raw script text; sizing, letterboxing, play, pause and
seek tracking are handled for you. Open the [playground](https://pulsariums.github.io/PAR/) to try every supported tag
with a built-in test card, your own video file or a video URL, without installing anything.

## Features

| | |
|---|---|
| **Zero dependencies** | About 30 kB gzipped. Plain TypeScript, no runtime packages, no WASM download. |
| **DOM, SVG and CSS** | Text stays real text, drawings are SVG paths, the browser's own text engine does the shaping. |
| **Plug and play** | `create({ video, subtitle })`. Letterbox, resize, play, pause and seek are tracked. |
| **libass semantics** | Tag precedence, `\t` ordering, karaoke timing and PlayRes fallbacks follow libass (one exception: scripts with no PlayRes at all default to 1920x1080; `defaultLayout: 'libass'` gives 384x288). |
| **Deterministic** | Same input, same output. Line ids come from file order, never from randomness. |
| **Your frame rate** | Render on every video frame (`auto`) or cap at 10 to 200 fps; optionally snap time to the video frame rate. |
| **Region and layout** | Visible video picture, whole container or any rectangle; script resolution or any virtual size. |
| **Honest limits** | Every tag is listed as rendered, approximate or not supported (see below). |

## Quick start (30 seconds)

<details open>
<summary><b>ES module / bundler</b></summary>

```sh
npm install pulsar-ass-renderer
```

```js
import { create } from 'pulsar-ass-renderer';

const assText = await (await fetch('episode.ass')).text();
const par = create({ video: document.querySelector('video'), subtitle: assText });
```

> The package is not on npm yet. Until the first release is published, build from source (see [Contributing](CONTRIBUTING.md)).
</details>

<details>
<summary><b>Script tag (window.PAR)</b></summary>

```html
<script src="https://unpkg.com/pulsar-ass-renderer/dist/par.global.js"></script>
<script>
  const par = PAR.create({ video: document.querySelector('video'), subtitle: assText });
</script>
```
</details>

<details>
<summary><b>Without a video (container + your own clock)</b></summary>

```js
const par = create({ container, subtitle: assText, clock: () => myPlayer.currentTime });

// or fully manual:
const still = create({ container, subtitle: assText });
still.renderAt(12.5); // seconds
```
</details>

The video's parent needs to be the element the overlay can sit on (it becomes `position: relative` if it was `static`).

## Options

<details>
<summary><b>All options</b></summary>

| Option | Type | Default | Description |
|---|---|---|---|
| `video` | `HTMLVideoElement` | - | Followed for time, play/pause/seek and size. |
| `container` | `HTMLElement` | `video.parentElement` | Element the overlay is mounted into; required without a video. A `position: static` container is switched to `relative` (restored by `destroy()`). |
| `subtitle` | `string \| SubtitleSource` | - | Raw `.ass` / `.ssa` text, or a `SubtitleSource` for big files (see [Big files](#big-files-windowed-sources)). |
| `region` | `'video' \| 'container' \| {x,y,width,height}` | `'video'` with a video, else `'container'` | Where subtitles are placed. `'video'`: the visible picture of the video, letterbox-aware, honouring `object-fit`. A rect is in container pixels. |
| `layout` | `'script' \| {width,height}` | `'script'` | Virtual coordinate space. `'script'` = the script's PlayRes (see [Default layout size](#default-layout-size-virtual-vs-real)). An explicit size treats the script as authored for that size and wins over everything. |
| `defaultLayout` | `'1080p' \| '720p' \| 'libass' \| {width,height}` | `'1080p'` | Virtual size for scripts without any PlayRes: 1920x1080, 1280x720, libass's 384x288, or your own. |
| `windowSeconds` | `number` | `12` | With a `SubtitleSource`: seconds of events kept in memory (about 1/6 behind the playhead, the rest ahead). |
| `fps` | `'auto' \| number` | `'auto'` | Render rate. `'auto'`: once per presented video frame (`requestVideoFrameCallback`), else once per display frame. A number in 10..200 caps the rate (it cannot exceed the display refresh rate). |
| `videoFps` | `number \| null` | `null` | Source video frame rate. When set, time is snapped to frame starts. Independent of `fps`. |
| `clock` | `() => number` | `video.currentTime` | Custom clock in seconds. |
| `timeOffset` | `number` | `0` | Seconds added to the clock (subtitle delay). |
| `fontMap` | `Record<string,string>` | `{}` | ASS font name to CSS `font-family`. Load the fonts yourself (`@font-face`). |
| `fonts` | `FontSpec[]` | `[]` | Fonts to load at creation (File, Blob, bytes, URL or `{ source, family }`). See [Fonts](#fonts). |
| `useLocalFonts` | `boolean` | `false` | Use installed fonts via the Local Font Access API (Chromium, needs permission). Never required. |
| `embeddedFonts` | `boolean` | `true` | Load the script's `[Fonts]` section. |
| `fontProviders` | `FontProvider[]` | `[]` | Async font sources (font library, URL map, your own), asked in order for families nothing earlier covers. See [Fonts](#fonts). |
| `providerTimeout` | `number` | `5000` | Per provider call, ms. A silent provider counts as "not found". |
| `onMissingFonts` | `(report, ctrl) => 'continue' \| 'wait' \| Promise` | none | Decides what happens when fonts are missing. Default: continue with fallback fonts. |
| `zIndex` | `number` | `1` | z-index of the overlay. |

Invalid values throw (`fps: 5` gives a `RangeError`, a zero-size region a `TypeError`).
</details>

## API

<details>
<summary><b>Reference</b></summary>

| Member | Description |
|---|---|
| `create(options)` / `new PARRenderer(options)` | Creates a renderer and mounts its overlay. |
| `setSubtitle(text \| SubtitleSource \| null)` | Loads or clears the subtitle. Never throws on malformed scripts (see `script.warnings`). |
| `setOptions(patch)` | Changes options at runtime; only the given keys change. Changing `video`/`container` remounts. |
| `renderAt(seconds)` | Renders media time `seconds` now (`timeOffset` and `videoFps` apply). |
| `refresh()` | Re-measures the region and re-renders the current time. |
| `getMetrics()` | `{ region, layout, scaleX, scaleY, layoutSize, regionSize, scale, layoutSource, layoutDerived, time, activeLines, running }`: virtual size, real size, their ratio and where the virtual size came from. |
| `getSourceStats()` | `{ windowEvents, windowRange, loading, bytesRead, decodeMs, indexMs }` of the loaded `SubtitleSource` (events in memory, loaded range, bytes read, decode time). |
| `script` | The parsed script (`ParsedScript`) or `null`. Read-only. |
| `element` | The overlay root element. |
| `destroy()` | Removes overlay, listeners, observers and loop. Further calls throw. |

Pure (DOM-free) helpers are exported too: `parseScript`, `parseText`, `parseBlock`, `parseTransition`, `lexOverrides`,
`parseDrawing`, `resolvePlayRes`, `fitRect`, `resolveRegion`, `resolveLayoutSize`, `stageTransform`, `VERSION` and all types.

**Lifecycle.** With a video the loop runs only while it plays; pause, seek, metadata and size changes render one frame.
With a custom clock and no video the loop runs continuously (it skips work when the time has not changed). With neither,
nothing runs until you call `renderAt()`. The overlay uses `pointer-events: none`, so video controls keep working.
</details>

## Default layout size (virtual vs real)

Two sizes are always involved. The **virtual** (layout) size is the coordinate space the script is laid out in: `\pos`, margins, font sizes and borders are all numbers in it. The **real** size is the region of the screen the result is drawn into, in CSS pixels. PAR scales the virtual frame onto the real region (`scale = real / virtual`, per axis).

Order in which the virtual size is chosen:

| Step | Source | `getMetrics().layoutSource` |
|---|---|---|
| 1 | the `layout: { width, height }` option | `'option'` |
| 2 | the script's `PlayResX` **and** `PlayResY` | `'script'` |
| 3 | only one of them: the other side follows the aspect ratio of the displayed region (16:9 when there is no usable region); with `defaultLayout: 'libass'` the libass rule is used instead (X only: Y = X x 3/4, with 1280 giving 1024; Y only: X = Y x 4/3, with 1024 giving 1280) | `'script'`, `layoutDerived: true` |
| 4 | neither | `defaultLayout`: `'1080p'` (default, 1920x1080), `'720p'` (1280x720), `'libass'` (384x288) or `{ width, height }` -> `'default'` |

`getMetrics()` reports both worlds: `layoutSize` (virtual), `regionSize` (real, CSS px), `scale` (`{ x, y }`, real / virtual), `layoutSource` and `layoutDerived` (the older `layout`, `region`, `scaleX`, `scaleY` stay).

**What the default changes.** libass and VSFilter fall back to 384x288 when a script has no PlayRes. PAR's default is 1920x1080 instead, which is what most modern scripts and video players assume. Everything in the script is a number in the virtual space, so the default decides how big it looks: a `Fontsize: 20` is 6.9 % of the picture height at 384x288 but 1.9 % at 1920x1080; outlines, shadows, margins and positions scale the same way. A script written for libass without PlayRes therefore looks about 3.75 times smaller in PAR's default than in libass. Use `defaultLayout: 'libass'` for strict libass compatibility. Scripts that carry a PlayRes are not affected.

## Frame times: when is a line visible

A line is visible from its start **up to, but not including,** its end (`startMs <= t < endMs`). When one line ends exactly where the next begins (`1.00` to `1.00`, very common), at that instant the first is gone and the second is there: never both, never neither. A line whose end is not after its start is never visible. All of it is compared as **integer milliseconds**: ASS times are centiseconds, and the media time is converted once with `Math.round(t * 1000)` (what mpv does before calling libass), so float noise such as `0.1 + 0.2` cannot move a boundary. `\fad`, `\t`, `\move` and karaoke times use the same integer base (ms since the line start).

With `videoFps` the time first snaps to the **start of its frame**: frame `n` is evaluated at exactly `n / fps` (NTSC rates 23.976, 29.97, 59.94 are the fractions 24000/1001, 30000/1001, 60000/1001, no float accumulation), converted to ms with one rounding. At 24 fps a line starting at `2.02` first shows on the frame at `2.042 s`, not on the one at `2.000 s`; a line ending at `1.00` is already gone on the frame at `1.000 s`. `fps` (how often PAR draws) and `videoFps` (the frame grid the time snaps to) are independent. Try the "Time boundaries" preset in the playground and step frame by frame in the Lab.

## Big files: windowed sources

`subtitle` also takes a `SubtitleSource`: the renderer then keeps only a sliding window of events in memory (about 2 s behind the playhead and 10 s ahead, `windowSeconds: 12`), reads ahead in slices, cancels reads that a seek made stale, and draws **nothing** (rather than wrong lines) for a time whose events are not loaded yet. A 100 MB script plays with a few seconds of it in memory.

```ts
import { create } from 'pulsar-ass-renderer';
import { fromAssFile, openSourceInWorker } from 'pulsar-ass-renderer/source';

const source = await openSourceInWorker(file, {            // File or Blob: .ass, .ssa, .xpar or .par (sniffed from content)
  worker: () => new Worker(new URL('pulsar-ass-renderer/worker', import.meta.url), { type: 'module' }),
  onProgress: (bytes, total) => bar.update(bytes / total), // indexing a 100 MB file takes a few seconds
});
const par = create({ video, subtitle: source, windowSeconds: 12 });
par.getSourceStats(); // { windowEvents, windowRange: [from, to] | null, loading, bytesRead, decodeMs, indexMs }
```

Adapters (`pulsar-ass-renderer/source`): `fromAssText(text)` (also exported by the main entry), `fromAssFile(blob)` (one streaming pass builds a small time index, windows are read with `Blob.slice`; the text is never held as one string), `fromXpar(blobOrUrl)` and `fromPar(...)` (only the chunks of a window are read and decoded; URLs need HTTP Range), `openSource(blob)` (sniffs the type) and `openSourceInWorker(blob, { worker })` (indexing and decoding in a Worker, falling back to chunked async reads on the main thread when no Worker is given). Implement `SubtitleSource` yourself to feed events from anywhere: `{ script, duration, eventCount, readWindow(t0, t1, signal?) }`; windows are half-open on integer ms, events are the structures `parseScript` yields (same ids). Fonts: styles name the starting set, fonts used in overrides are added as their windows arrive, `[Fonts]` is read from the source (`fontSection()`); the missing-font flow works unchanged.

## The Lab

The [Lab section of the site](https://pulsariums.github.io/PAR/#lab-root) opens your own `.ass` / `.ssa` / `.xpar` / `.par` (nothing is uploaded): file size and statistics, the real **XPAR** size and the **PAR** (lossy) size at a chosen fps (exact for small files, sampled estimates with a stated margin for big ones, then exact on demand, with progress and cancel; downloads `name.xpar` and `name.<fps>fps.par`), the virtual vs real size with a switchable default (1080p / 720p / libass 384x288 / custom) and override, and a timeline player whose length is the subtitle's duration with seek, frame / 1 s / 5 s steps, previous / next line, speed, loop, render fps and video fps, keyboard shortcuts (Space or K, arrows, Shift + arrows, J / L, [ / ], Home / End) and live window and timing numbers. Large files are indexed and decoded in a Worker. `.par` is lossy: it cannot rebuild the original ASS and is only visually equivalent at its target fps.

## Fonts

Scripts name fonts; PAR makes the browser use them. Resolution order for an ASS font name (leading `@` removed, case-insensitive): **loaded face** (user-supplied, then embedded) -> `fontMap` -> **provider face** (`fontProviders`) -> **installed font from `useLocalFonts`** -> system font -> generic `sans-serif` fallback (reported as `missing`). Bold/italic pick the real face when one is loaded; otherwise the browser draws it synthetically and the report says so (libass rule: weight asked > face weight + 150).

```ts
const par = create({ video, subtitle, fonts: [fontFile] });   // File | Blob | ArrayBuffer | URL | .zip
await par.addFonts(input.files);     // many at once; family names are read from the fonts' `name` table (TTF, OTF, TTC, WOFF, WOFF2*)
await par.ready;                     // all font loads finished and the re-layout ran
par.getFontReport();                 // { fonts: [{ name, status: 'embedded'|'user'|'provider'|'local'|'system'|'missing', styles, lines, ... }], missing, pending, warnings }
par.listFonts(); par.removeFont(id); par.onFontsChange(fn);
await par.loadLocalFonts();          // call from a click: Local Font Access API, false when unsupported or denied
```

- **Embedded fonts**: the `[Fonts]` section (SSA/ASS uuencode, several fonts, partial last lines) is decoded and registered with `document.fonts`. Identical bytes are registered once and ref-counted per renderer; `destroy()` releases them.
- **Load timing**: while the script's fonts load, nothing is drawn, then lines are rebuilt and measured with the right font (no per-frame waiting).
- **Font metrics**: libass sizes `\fs` so that `usWinAscent + usWinDescent` equals it (read from libass `ass_font.c`, `set_font_metrics` / `ass_face_set_size`). PAR uses `font-size = fs * unitsPerEm / (winAscent + winDescent)` for loaded fonts (fallbacks hhea, typo, bbox as in libass). For system fonts the browser's canvas `fontBoundingBox` ascent + descent is measured instead (usually hhea based, so it can differ from libass for fonts whose win and hhea metrics differ); unknown metrics keep the old factor 0.9. Not compared pixel by pixel against a libass build.
- **Limits**: PAR distributes no fonts and does no subsetting; embedded fonts come from the script author, so mind their licenses. `[Graphics]` is ignored. Browsers load only the first face of a TTC, so PAR extracts each member. WOFF2 name detection needs `DecompressionStream('brotli')` (else the file name is used as family; pass `{ family }`). A font is global to the page: two different fonts with the same family, weight and style conflict. `queryLocalFonts` is Chromium-only and untested in headless runs. `\fe` and font encodings are ignored.

### Font providers, preflight and the "font is missing" flow

**Resolution order** (leading `@` removed, case-insensitive): user-supplied face -> embedded `[Fonts]` face -> `fontMap` -> **`fontProviders` (array order)** -> installed font from `useLocalFonts` -> system font -> generic fallback (`missing`). A provider face is only used when nothing before it covers the name; asking for bold when a provider face is regular makes PAR ask the provider for the bold variant.

```ts
import { create, createUrlProvider, preflightScript, createMissingFontsPrompt } from 'pulsar-ass-renderer';
import { FontLibrary } from 'pulsar-ass-renderer/fontlib';

const library = await FontLibrary.open();                       // the user's own persistent font store (IndexedDB)
const par = create({
  video, subtitle,
  fontProviders: [library.asProvider(), createUrlProvider('cdn', { 'Open Sans': 'https://example.com/OpenSans.woff2' })],
  onMissingFonts: () => 'continue',                             // or 'wait' / a Promise (see below)
});
par.on('missingfonts', (report) => showPrompt(report));          // fires again when the missing set changes (also to ok: true)

const report = await preflightScript(assText, { fontProviders: [library.asProvider()] });   // no renderer, no DOM needed
// { ok, resolved[], missing[], synthetic[], providerHits, missingGlyphs, warnings, stats }
await par.preflight();                  // same for the loaded script (waits for font work); par.preflight(otherText) preloads providers' fonts for it
```

- **Provider**: `{ name, has?(family), get(family, { weight, italic }) -> bytes | Blob | URL | zip | null, subscribe?(fn) }`. A throwing, slow (`providerTimeout`) or corrupt provider only produces a warning. `subscribe` lets a provider tell PAR it got new fonts; otherwise call `par.refreshProviders()`. `createUrlProvider(name, urlMap | { manifest })` downloads lazily, once per URL (CORS applies).
- **Preflight** scans the Style section and every `{...}` block (`\fn`, `\b`, `\i`, `\r`, `\p`; `\t(...)` cannot change fonts) with the same lexer the renderer uses, without building events: memory does not grow with the script. Accepts a string, an iterable / async iterable of lines, or `linesFromChunks(stream)` for a download in progress; or only `usedFonts: ['Arial', { family, bold, italic }]` when something else already knows them (`signal` and `onProgress` for huge files). Styles must come before events when streaming (a warning says so). `synthetic` lists fonts where bold/italic would be faked; `missing` lists fonts nothing serves.
- **Missing glyphs**: for fonts PAR holds as a face (user, embedded, provider, local) the used characters (`usedCharacters(text)`: no tags, no `\N` `\h`, no drawings) are checked against the font's `cmap` (formats 4 and 12): `report.missingGlyphs[family] = { count, sample }` (sample capped at 64 code points). System fonts cannot be inspected. This is a warning, `ok` stays true.
- **Decision**: when a script's fonts have settled and some are missing, `onMissingFonts(report, ctrl)` is called once per script. `'continue'` (default) draws fallback fonts. `'wait'`, or a pending Promise, holds back every event that uses a missing family (other events draw normally) until `ctrl.continue()` / `par.continueWithMissing()` or until the fonts arrive. Throwing or rejecting means continue. `par.ready` resolves when all font work is done and the hook was *called*; it never waits for a person.
- **Prompt helper** (optional, no CSS, no modal): `createMissingFontsPrompt(container, report, { onContinue, onAddFonts, texts })` renders "Font X is missing. Continue anyway? [Continue] [Add font]" as an `alertdialog` with real, always visible buttons; Escape closes it; texts are yours (i18n).
- **Font library** (`pulsar-ass-renderer/fontlib`, own ~11 kB gzip entry, never imported by the core): `FontLibrary.open(name = 'par-fonts')`, `add(files | zip)` (SHA-256 dedupe), `list()` (metadata only, bytes load lazily), `lookup(name)` / `find(name, weight, italic)` by family, full name, PostScript name or alias (case-insensitive, `@` ignored), `remove(ids)`, `setAliases(id, names)`, `coverage(id)`, `usage()` + `requestPersistence()` (`navigator.storage`), `exportZip()`, `repair()`, `onChange(fn)`, `asProvider()`. Helpers for UIs: `scriptBadges` (Latin, Latin Extended incl. Turkish / Azerbaijani, Cyrillic, Greek, Hiragana, Katakana, Kanji sample, symbols), `blockStats`, `sliceCps`. The playground's Fonts tab is a complete example (previews, paged character grid, grouping, search, bulk delete).
- **Legal / product note**: PAR does not host or distribute fonts and has no shared font hosting. The library is the user's own local store; fonts never leave the device unless the host app does that itself. Respect font licenses.
- **Limits**: provider faces stay registered until the provider list changes or the renderer is destroyed; the schema has one version (migration machinery exists, no migration yet); `exportZip` is uncompressed and does not round-trip aliases; Safari may evict IndexedDB without `persist()`; glyph checks use `cmap` only (no GSUB / fallback shaping); WOFF2 needs Brotli for names.

## Supported tags

Statuses are kept in sync with the playground's feature test matrix, where every row loads a preset you can check by eye.
**Rendered** = drawn in the DOM. **Approximate** = drawn, but differs from libass in a known way. **Not supported** = not drawn.

<details open>
<summary><b>Tag support table</b></summary>

| Tag / feature | Status | Notes |
|---|---|---|
| `\pos` `\move(x1,y1,x2,y2[,t1,t2])` | Rendered | First `\pos`/`\move` of the line wins (libass). |
| `\an` `\a` | Rendered | First wins; legacy `\a` is converted. |
| `\org` `\frx` `\fry` `\frz` `\fr` | Rendered | 3D with a fixed perspective; `\org` defaults to the anchor point. |
| `\fad` `\fade` | Rendered | Line opacity, first wins. |
| `\clip` `\iclip` (rect) | Rendered | CSS `clip-path` on the whole event, in script coordinates (does not follow `\pos`/`\move`/rotation). Last wins; corners are not reordered (an empty rect hides the line, as in libass); animatable with `\t` from the whole script area. Edges are anti-aliased (libass cuts on whole pixels). |
| `\clip` `\iclip` (vector, with scale) | Rendered | First vector clip wins and applies together with a rect clip (libass). Not animatable (as in libass). |
| `\t([t1,t2,][accel,]tags)` | Rendered | Multiple tags, optional times, acceleration, source-order evaluation. |
| `\k` `\K` `\kf` `\ko` `\kt` | Rendered | Colour switch, sweep, outline reveal. |
| `\r` `\r<style>` | Rendered | Unknown style falls back to the line style. |
| `\fn` `\fs` (`\fs+n`/`\fs-n`) `\fscx` `\fscy` `\fsp` | Rendered | Loaded / embedded face, `fontMap`, or the name itself (see Fonts). |
| `\fax` `\fay` | Rendered | Pivot is the text top-left. Per-fragment differences use the first fragment's value. |
| `\b` `\i` `\u` `\s` | Rendered | |
| `\bord` `\shad` `\xshad` `\yshad` | Rendered | Shadow, outline and fill are separate layers when a blur or a translucent fill needs it; a translucent fill cuts the glyph out of the outline like libass. CSS strokes use miter joins where libass rounds. |
| `\xbord` `\ybord` | Approximate | Uses the larger of x/y when they differ. |
| `\blur` | Rendered | Gaussian with libass' sigma (`blur * 0.849`); with a border only the outline and shadow are blurred and the fill stays sharp (libass). Blur is not scaled by `ScaledBorderAndShadow`. Stretched by `\fscx`/`\fscy` ratios and sheared with `\fax`/`\frx`, where libass blurs the final bitmap. |
| `\be` | Approximate | N passes of libass' 3x3 box kernel are modelled as one gaussian of sigma sqrt(N/2) device pixels, with libass' rounding and 127 limit. |
| `\c` `\1c`..`\4c` `\alpha` `\1a`..`\4a` | Rendered | |
| `\p<n>` drawings (`m n l b s p c`), `\pbo` | Rendered | SVG path; spline close (`c`) is a straight close. |
| `\q1` `\q2` | Rendered | Normal wrap / no wrap. |
| `\q0` `\q3`, `WrapStyle` 0 and 3 | Approximate | Uses CSS `text-wrap: balance`. |
| `\N` `\n` `\h` | Rendered | |
| BorderStyle 1 and 3 | Rendered | Outline+shadow / opaque box. |
| Layers, collision stacking, comments | Rendered | Unpositioned lines stack and keep their place; `Comment:` is skipped. |
| `\fe` | Not supported | Parsed and ignored (no meaning for web fonts). |
| Event `Effect` (`Banner;`, `Scroll up;`, `Scroll down;`) | Not supported | |
| `\kf` sweep on drawings | Not supported | Drawings switch colour at the end. |
| `[Graphics]`, BorderStyle 4, LayoutResX/Y correction | Not supported | `LayoutResX/Y` is parsed, not used. |
</details>

<details>
<summary><b>Known limitations</b></summary>

- **Glyph metrics.** The browser shapes and rasterizes text; `\fs` maps to CSS with a fixed ratio (0.9), so widths, line heights and hinting differ slightly from libass.
- A fragment whose rotation differs from the line's first fragment rotates around its own centre; a fragment with a different `\fscx`/`\fscy` ratio becomes an inline-block (no wrapping inside it); a `\kf` syllable cannot wrap across lines.
- A script whose PlayRes aspect differs from the video is stretched (like VSFilter).
- A missing `ScaledBorderAndShadow` is `no`, like current libass and VSFilter; the one exception is libass' compatibility rule: when the `[V4+ Styles]` Format line is not the standard one, a missing key means `yes`. With `no`, border, shadow and blur scale by layout height / storage height (the script's `LayoutResY`, else the video's pixel height); with neither known the flag changes nothing (libass without a storage size).
- In headless Chromium on Linux we observed positive `\fax` drawn without the glyph slant (negative values are fine). This looks like a rasterizer issue, not a PAR transform issue.
</details>

## How PAR compares

<details>
<summary><b>PAR vs. libass-wasm, JASSUB and SubtitlesOctopus</b></summary>

libass-wasm, JASSUB and SubtitlesOctopus compile the reference C library **libass** to WebAssembly and draw to a canvas.
PAR is a different trade-off: it does not embed libass, it renders with the browser.

| | PAR | libass-wasm / JASSUB / SubtitlesOctopus |
|---|---|---|
| Approach | DOM, SVG and CSS | libass compiled to WebAssembly |
| WASM binary to ship | No | Yes (plus a worker script) |
| Footprint | About 30 kB gzipped, zero dependencies | Larger: carries the compiled library |
| Framework | None required, plain TypeScript | Plain JS, each with its own setup |
| Output | Real DOM nodes and SVG | Pixels on a canvas |
| Glyph-exact libass output | No (approximations are listed above) | Yes, that is the point of using libass |
| Embedded fonts | Supported (`[Fonts]`) | Supported by libass-based renderers |

Pick a libass-based renderer when pixel-faithful output and complete tag coverage matter most. Pick PAR when a small, WASM-free,
inspectable DOM renderer is enough. Check each project's own documentation for current details.
</details>

## Browser support

Evergreen browsers: Chrome/Edge 88+, Firefox 97+, Safari 13.1+ (CSS `clip-path: path()`, `ResizeObserver`). Optional features
degrade gracefully: `requestVideoFrameCallback` (else rAF), `paint-order` on HTML text (Chrome 123+, Firefox, Safari; without
it the outline also covers the inner half of the glyph edge), `text-wrap: balance` (else greedy wrapping).

## FAQ

<details>
<summary>Is the output identical to libass?</summary>

No. PAR follows libass semantics for tag precedence and timing, but the browser draws the glyphs, so metrics differ slightly. See the status table.
</details>

<details>
<summary>Does it work with HLS, DASH or other streaming players?</summary>

PAR reads time from a standard `<video>` element (or from your own `clock`), so anything that plays in a `<video>` works. If your player does not use one, pass `container` and a `clock`.
</details>

<details>
<summary>How do I use it with React, Vue or Svelte?</summary>

Create it after the element exists (effect / `onMount`) and call `par.destroy()` on cleanup. PAR has no framework code and does not touch your component tree beyond its own overlay element.
</details>

<details>
<summary>How do I fix subtitle timing?</summary>

Use `timeOffset` (seconds, positive delays the subtitles) and, for frame-exact snapping, `videoFps`.
</details>

<details>
<summary>Fullscreen shows no subtitles. Why?</summary>

Only the fullscreen element's subtree is displayed. Request fullscreen on the container that holds both the video and the PAR overlay, not on the `<video>` alone.
</details>

<details>
<summary>How do embedded fonts work?</summary>

They are decoded from `[Fonts]` and registered with the browser. See [Fonts](#fonts).
</details>

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks and the maintainer notes
(including the one-time **Settings → Pages → Source: GitHub Actions** step). Report security problems as described in [SECURITY.md](SECURITY.md).

## Maintainers: GitHub Pages

The site in `site/` is deployed by `.github/workflows/pages.yml` on every push to `main`. One-time setup: **Settings → Pages →
Build and deployment → Source: GitHub Actions**. Details in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, (c) Pulsariums. See [LICENSE](LICENSE).
