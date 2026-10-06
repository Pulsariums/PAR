<div align="center">

**English** · [Türkçe](README.tr.md) · [Русский](README.ru.md)

<img src="assets/banner.svg" alt="PAR - Pulsar ASS Renderer: an animated karaoke sweep over the project name" width="100%" />

<p>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/Pulsariums/PAR?color=5b3df5" /></a>
  <a href="https://github.com/Pulsariums/PAR/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Pulsariums/PAR/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/Pulsariums/PAR/actions/workflows/pages.yml"><img alt="Pages" src="https://github.com/Pulsariums/PAR/actions/workflows/pages.yml/badge.svg" /></a>
  <img alt="Version" src="https://img.shields.io/github/package-json/v/Pulsariums/PAR?color=5b3df5" />
  <img alt="Size: about 14 kB gzipped" src="https://img.shields.io/badge/gzip-~14%20kB-5b3df5" />
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
| **Zero dependencies** | About 14 kB gzipped. Plain TypeScript, no runtime packages, no WASM download. |
| **DOM, SVG and CSS** | Text stays real text, drawings are SVG paths, the browser's own text engine does the shaping. |
| **Plug and play** | `create({ video, subtitle })`. Letterbox, resize, play, pause and seek are tracked. |
| **libass semantics** | Tag precedence, `\t` ordering, karaoke timing and PlayRes fallbacks follow libass. |
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
| `subtitle` | `string` | - | Raw `.ass` / `.ssa` text. |
| `region` | `'video' \| 'container' \| {x,y,width,height}` | `'video'` with a video, else `'container'` | Where subtitles are placed. `'video'`: the visible picture of the video, letterbox-aware, honouring `object-fit`. A rect is in container pixels. |
| `layout` | `'script' \| {width,height}` | `'script'` | Virtual coordinate space. `'script'` = PlayResX/PlayResY with libass fallbacks. An explicit size treats the script as authored for that size. |
| `fps` | `'auto' \| number` | `'auto'` | Render rate. `'auto'`: once per presented video frame (`requestVideoFrameCallback`), else once per display frame. A number in 10..200 caps the rate (it cannot exceed the display refresh rate). |
| `videoFps` | `number \| null` | `null` | Source video frame rate. When set, time is snapped to frame starts. Independent of `fps`. |
| `clock` | `() => number` | `video.currentTime` | Custom clock in seconds. |
| `timeOffset` | `number` | `0` | Seconds added to the clock (subtitle delay). |
| `fontMap` | `Record<string,string>` | `{}` | ASS font name to CSS `font-family`. Load the fonts yourself (`@font-face`). |
| `zIndex` | `number` | `1` | z-index of the overlay. |

Invalid values throw (`fps: 5` gives a `RangeError`, a zero-size region a `TypeError`).
</details>

## API

<details>
<summary><b>Reference</b></summary>

| Member | Description |
|---|---|
| `create(options)` / `new PARRenderer(options)` | Creates a renderer and mounts its overlay. |
| `setSubtitle(text \| null)` | Loads or clears the subtitle. Never throws on malformed scripts (see `script.warnings`). |
| `setOptions(patch)` | Changes options at runtime; only the given keys change. Changing `video`/`container` remounts. |
| `renderAt(seconds)` | Renders media time `seconds` now (`timeOffset` and `videoFps` apply). |
| `refresh()` | Re-measures the region and re-renders the current time. |
| `getMetrics()` | `{ region, layout, scaleX, scaleY, time, activeLines, running }`. |
| `script` | The parsed script (`ParsedScript`) or `null`. Read-only. |
| `element` | The overlay root element. |
| `destroy()` | Removes overlay, listeners, observers and loop. Further calls throw. |

Pure (DOM-free) helpers are exported too: `parseScript`, `parseText`, `parseBlock`, `parseTransition`, `lexOverrides`,
`parseDrawing`, `resolvePlayRes`, `fitRect`, `resolveRegion`, `resolveLayoutSize`, `stageTransform`, `VERSION` and all types.

**Lifecycle.** With a video the loop runs only while it plays; pause, seek, metadata and size changes render one frame.
With a custom clock and no video the loop runs continuously (it skips work when the time has not changed). With neither,
nothing runs until you call `renderAt()`. The overlay uses `pointer-events: none`, so video controls keep working.
</details>

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
| `\clip` `\iclip` (rect) | Rendered | CSS `clip-path`; last wins; animatable with `\t`. |
| `\clip` `\iclip` (vector, with scale) | Rendered | Not animatable (as in libass). |
| `\t([t1,t2,][accel,]tags)` | Rendered | Multiple tags, optional times, acceleration, source-order evaluation. |
| `\k` `\K` `\kf` `\ko` `\kt` | Rendered | Colour switch, sweep, outline reveal. |
| `\r` `\r<style>` | Rendered | Unknown style falls back to the line style. |
| `\fn` `\fs` (`\fs+n`/`\fs-n`) `\fscx` `\fscy` `\fsp` | Rendered | Font family via `fontMap` or the name itself. |
| `\fax` `\fay` | Rendered | Pivot is the text top-left. Per-fragment differences use the first fragment's value. |
| `\b` `\i` `\u` `\s` | Rendered | |
| `\bord` `\shad` `\xshad` `\yshad` | Rendered | CSS text stroke and shadow. |
| `\xbord` `\ybord` | Approximate | Uses the larger of x/y when they differ. |
| `\blur` `\be` | Approximate | CSS `blur()` over the whole fragment (fill and outline together). |
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
| `[Fonts]` / `[Graphics]`, BorderStyle 4, LayoutResX/Y correction | Not supported | `LayoutResX/Y` is parsed, not used. |
</details>

<details>
<summary><b>Known limitations</b></summary>

- **Glyph metrics.** The browser shapes and rasterizes text; `\fs` maps to CSS with a fixed ratio (0.9), so widths, line heights and hinting differ slightly from libass.
- A fragment whose rotation differs from the line's first fragment rotates around its own centre; a fragment with a different `\fscx`/`\fscy` ratio becomes an inline-block (no wrapping inside it); a `\kf` syllable cannot wrap across lines.
- A script whose PlayRes aspect differs from the video is stretched (like VSFilter).
- A missing `ScaledBorderAndShadow` defaults to `yes` (libass); VSFilter treats it as `no`.
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
| Footprint | About 14 kB gzipped, zero dependencies | Larger: carries the compiled library |
| Framework | None required, plain TypeScript | Plain JS, each with its own setup |
| Output | Real DOM nodes and SVG | Pixels on a canvas |
| Glyph-exact libass output | No (approximations are listed above) | Yes, that is the point of using libass |
| Embedded fonts | Not supported | Supported by libass-based renderers |

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
<summary>Why are there no embedded fonts?</summary>

Not implemented. Load fonts with `@font-face` and map ASS font names with `fontMap`.
</details>

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks and the maintainer notes
(including the one-time **Settings → Pages → Source: GitHub Actions** step). Report security problems as described in [SECURITY.md](SECURITY.md).

## Maintainers: GitHub Pages

The site in `site/` is deployed by `.github/workflows/pages.yml` on every push to `main`. One-time setup: **Settings → Pages →
Build and deployment → Source: GitHub Actions**. Details in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, (c) Pulsariums. See [LICENSE](LICENSE).
