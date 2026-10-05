# PAR - Pulsar ASS Renderer

Dependency-free, plug-and-play ASS/SSA subtitle renderer for the browser (DOM + SVG + CSS).
Give it a `<video>` (or any container) and raw `.ass` text; it does the rest.

- [Türkçe](#türkçe)
- [English](#english)

---

## Türkçe

### PAR nedir?

PAR (Pulsar ASS Renderer), Advanced SubStation Alpha (`.ass`) ve SubStation Alpha (`.ssa`)
altyazılarını tarayıcıda DOM, SVG ve CSS ile çizen bağımsız bir kütüphanedir.

- **Sıfır bağımlılık:** Çalışma zamanında hiçbir pakete ihtiyaç duymaz. Pulsar Editor'a da bağlı değildir.
- **Tak-çalıştır:** Video elemanını ve `.ass` metnini verin. Boyutlandırma, letterbox, oynat/duraklat/sar takibi otomatik yapılır.
- **Deterministik:** Aynı girdi her zaman aynı çıktıyı verir. Satır kimlikleri dosya sırasından gelir, asla rastgele değildir.
- **libass kurallarına yakın:** Etiket önceliği, `\t` sırası, karaoke zamanlaması ve PlayRes yedekleri libass'teki gibi işler.

PAR bir WebAssembly libass portu değildir. Metni tarayıcının yazı motoru çizer, bu yüzden glif ölçüleri libass ile
piksel piksel aynı olmaz (bkz. [Sınırlamalar](#sınırlamalar)).

### Kurulum

**npm** (ilk sürüm yayınlandıktan sonra):

```sh
npm install pulsar-ass-renderer
```

**`<script>` etiketi** (IIFE derlemesi `window.PAR` tanımlar):

```html
<script src="https://unpkg.com/pulsar-ass-renderer/dist/par.global.js"></script>
```

**git:**

```sh
git clone https://github.com/Pulsariums/pulsar-ass-renderer.git
cd pulsar-ass-renderer && npm install && npm run build   # çıktı: dist/
```

### Hızlı başlangıç

```html
<div class="player" style="position: relative">
  <video id="v" src="episode.mp4" controls></video>
</div>
<script type="module">
  import { create } from 'pulsar-ass-renderer';
  const assText = await (await fetch('episode.ass')).text();
  const par = create({ video: document.getElementById('v'), subtitle: assText });
</script>
```

Video olmadan da çalışır (konteyner + kendi saatiniz):

```js
const par = PAR.create({ container: el, subtitle: assText, clock: () => myPlayer.time });
// ya da saat vermeden elle sürün:
const still = PAR.create({ container: el, subtitle: assText });
still.renderAt(12.5);
```

### Seçenekler

| Seçenek | Tür | Varsayılan | Açıklama |
|---|---|---|---|
| `video` | `HTMLVideoElement` | - | Zaman, oynat/duraklat/sar ve boyut bu elemandan izlenir. |
| `container` | `HTMLElement` | `video.parentElement` | Katmanın eklendiği eleman. Video yoksa zorunludur. `position: static` ise `relative` yapılır, `destroy()` geri alır. |
| `subtitle` | `string` | - | Ham `.ass`/`.ssa` metni. |
| `region` | `'video' \| 'container' \| {x,y,width,height}` | videoyla `'video'`, yoksa `'container'` | Altyazının ekrandaki alanı. `'video'`: `object-fit` (contain/cover/fill/none/scale-down) dikkate alınarak videonun görünen resmi (letterbox'a duyarlı). Dikdörtgen: konteyner pikseli. |
| `layout` | `'script' \| {width,height}` | `'script'` | Sanal koordinat uzayı. `'script'`: PlayResX/PlayResY (eksikse libass yedekleri: 384x288, X*3/4, Y*4/3, 1280<->1024). Nesne verilirse betik bu boyuta göre yazılmış sayılır. |
| `fps` | `'auto' \| number` | `'auto'` | Çizim hızı. `'auto'`: her video karesinde (`requestVideoFrameCallback`), yoksa her ekran karesinde (rAF). Sayı: 10..200 üst sınır (rAF ile sürülür, ekran tazeleme hızını aşamaz). |
| `videoFps` | `number \| null` | `null` | Kaynak videonun kare hızı. Verilirse zaman kare başına yuvarlanır. `fps`'ten bağımsızdır. |
| `clock` | `() => number` | `video.currentTime` | Özel saat (saniye). |
| `timeOffset` | `number` | `0` | Saate eklenen saniye (altyazı gecikmesi). |
| `fontMap` | `Record<string,string>` | `{}` | ASS yazı tipi adı -> CSS `font-family`. Yazı tiplerini `@font-face` ile siz yüklersiniz. |
| `zIndex` | `number` | `1` | Katmanın z-index değeri. |

Geçersiz değerler açık hata fırlatır (`fps: 5` -> `RangeError`).

### API

```ts
const par = PAR.create(options);   // ya da new PARRenderer(options)
par.setSubtitle(text | null);      // yükle / temizle (bozuk betikte hata fırlatmaz)
par.setOptions({ region: 'container', fps: 30 }); // yalnız verilen anahtarlar değişir
par.renderAt(seconds);             // o anı çiz (timeOffset ve videoFps uygulanır)
par.refresh();                     // bölgeyi yeniden ölç ve yeniden çiz
par.getMetrics();                  // { region, layout, scaleX, scaleY, time, activeLines, running }
par.script;                        // ayrıştırılmış betik (salt okunur) ya da null
par.element;                       // katman kök elemanı
par.destroy();                     // katmanı, dinleyicileri ve döngüyü kaldırır
```

Saf (DOM'suz) yardımcılar: `parseScript`, `parseText`, `parseBlock`, `parseTransition`, `lexOverrides`,
`parseDrawing`, `resolvePlayRes`, `fitRect`, `resolveRegion`, `resolveLayoutSize`, `stageTransform`, `VERSION`.

Video ile kullanımda döngü yalnız video oynarken çalışır. Duraklatıldığında, sarıldığında, boyut veya
metadata değiştiğinde tek kare çizilir. `ResizeObserver` konteyneri ve videoyu izler. Katman
`pointer-events: none` kullanır, video kontrollerini engellemez.

### Desteklenen etiketler

Tablonun tamamı [İngilizce bölümde](#supported-tags) (aynı içerik). Özet: konum (`\pos \move \an \a \org`),
solma (`\fad \fade`), kırpma (`\clip \iclip`, dikdörtgen + vektör), `\t` (iç içe, ivmeli, zamansız),
karaoke (`\k \K \kf \ko \kt`), `\r`, yazı tipi ve ölçek (`\fn \fs \fscx \fscy \fsp`), döndürme ve
eğme (`\frx \fry \frz \fax \fay`), kenar/gölge/bulanıklık, renk ve alfa etiketleri, `\p` çizimleri, `\q`.

### Sınırlamalar

- Gliflerin ölçüsü tarayıcı yazı motorundan gelir, libass ile birebir aynı değildir (`\fs` -> CSS için 0.9 oranı kullanılır).
- Gömülü yazı tipleri (`[Fonts]`), `Effect` alanı (Banner/Scroll), LayoutRes en-boy düzeltmesi desteklenmez.
- Ayrıntılı liste: [Limitations](#limitations).

### Geliştirme

```sh
npm install
npm run dev        # demo: http://localhost:5173 (video + .ass seçin)
npm test           # vitest
npm run typecheck
npm run build      # dist/: par.js (ESM), par.cjs, par.global.js (IIFE), types/
npm run build:demo # demo-dist/: statik site (GitHub Pages için hazır)
```

Lisans: MIT, (c) Pulsariums.

---

## English

### What is PAR?

PAR (Pulsar ASS Renderer) is a standalone library that renders Advanced SubStation Alpha (`.ass`) and
SubStation Alpha (`.ssa`) subtitles in the browser with DOM, SVG and CSS.

- **Zero dependencies** at runtime, and no dependency on Pulsar Editor.
- **Plug-and-play:** pass a video element and the `.ass` text; sizing, letterboxing, play/pause/seek tracking are automatic.
- **Deterministic:** the same input always produces the same output; line ids come from file order, never from randomness.
- **Follows libass rules** for tag precedence, `\t` ordering, karaoke timing and PlayRes fallbacks.

PAR is not a WebAssembly port of libass. Text is drawn by the browser's text engine, so glyph metrics are
not pixel-identical to libass (see [Limitations](#limitations)).

### Install

**npm** (after the first release is published):

```sh
npm install pulsar-ass-renderer
```

**`<script>` tag** (the IIFE build defines `window.PAR`):

```html
<script src="https://unpkg.com/pulsar-ass-renderer/dist/par.global.js"></script>
<script>
  const par = PAR.create({ video: document.querySelector('video'), subtitle: assText });
</script>
```

**git:**

```sh
git clone https://github.com/Pulsariums/pulsar-ass-renderer.git
cd pulsar-ass-renderer && npm install && npm run build   # output: dist/
```

### Quick start

```js
import { create } from 'pulsar-ass-renderer';

const assText = await (await fetch('episode.ass')).text();
const par = create({ video: document.querySelector('video'), subtitle: assText });

// later
par.setSubtitle(otherAssText);
par.setOptions({ region: 'container', layout: { width: 1920, height: 1080 }, fps: 60 });
par.destroy();
```

Without a video (container + your own clock, or fully manual):

```js
const par = create({ container, subtitle: assText, clock: () => myPlayer.currentTime });

const manual = create({ container, subtitle: assText });
manual.renderAt(12.5); // seconds
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `video` | `HTMLVideoElement` | - | Followed for time, play/pause/seek and size. |
| `container` | `HTMLElement` | `video.parentElement` | Element the overlay is mounted into; required without a video. A `position: static` container is switched to `relative` (restored by `destroy()`). |
| `subtitle` | `string` | - | Raw `.ass` / `.ssa` text. |
| `region` | `'video' \| 'container' \| {x,y,width,height}` | `'video'` with a video, else `'container'` | Where subtitles are placed. `'video'`: the visible picture of the video, letterbox-aware, honouring `object-fit` (contain / cover / fill / none / scale-down; centred `object-position`). A rect is in container pixels. |
| `layout` | `'script' \| {width,height}` | `'script'` | Virtual coordinate space. `'script'` = PlayResX/PlayResY with libass fallbacks (none: 384x288; only X: Y = X*3/4, 1280 -> 1024; only Y: X = Y*4/3, 1024 -> 1280). An explicit size treats the script as authored for that size. |
| `fps` | `'auto' \| number` | `'auto'` | Render rate. `'auto'`: once per presented video frame (`requestVideoFrameCallback`) or, without it, once per display frame (rAF). A number in 10..200 caps the rate (rAF-driven, so it cannot exceed the display refresh rate). |
| `videoFps` | `number \| null` | `null` | Source video frame rate. When set, time is snapped to frame starts. Independent of `fps`. |
| `clock` | `() => number` | `video.currentTime` | Custom clock in seconds. |
| `timeOffset` | `number` | `0` | Seconds added to the clock (subtitle delay). |
| `fontMap` | `Record<string,string>` | `{}` | ASS font name -> CSS `font-family`. Load the fonts yourself (`@font-face`). |
| `zIndex` | `number` | `1` | z-index of the overlay. |

Invalid values throw (`fps: 5` -> `RangeError`, zero-size region -> `TypeError`).

### API reference

| Member | Description |
|---|---|
| `create(options)` / `new PARRenderer(options)` | Creates a renderer and mounts its overlay. |
| `setSubtitle(text \| null)` | Loads or clears the subtitle. Never throws on malformed scripts (see `script.warnings`). |
| `setOptions(patch)` | Changes options at runtime; only the given keys change. Changing `video`/`container` remounts. |
| `renderAt(seconds)` | Renders media time `seconds` now (`timeOffset` and `videoFps` apply). With a running loop the next tick wins. |
| `refresh()` | Re-measures the region and re-renders the current time. |
| `getMetrics()` | `{ region, layout, scaleX, scaleY, time, activeLines, running }`. |
| `script` | The parsed script (`ParsedScript`) or `null`. Treat as read-only. |
| `element` | The overlay root element. |
| `destroy()` | Removes overlay, listeners, observers and loop. Further calls throw. |

Pure (DOM-free) helpers are exported too: `parseScript(text)`, `parseText(eventText)`, `parseBlock`,
`parseTransition`, `lexOverrides`, `parseDrawing`, `resolvePlayRes`, `fitRect`, `resolveRegion`,
`resolveLayoutSize`, `stageTransform`, plus `VERSION` and all types.

**Lifecycle.** With a video, the loop runs only while it plays; pause, seek, metadata and size changes
render a single frame. A `ResizeObserver` watches the container and the video. With a custom clock and no
video the loop runs continuously (it skips work when the time has not changed). With neither, nothing runs
until you call `renderAt()`. The overlay uses `pointer-events: none`, so video controls keep working.

**How it renders.** The overlay holds one *stage* the size of the layout space, mapped onto the region with a
single CSS `scale()`; resizing only changes that transform. When an event becomes visible its DOM is built
once (`.par-line[data-par-id] > .par-layer > .par-box > .par-frag`); per frame only lines with
animation (`\t`, `\move`, `\fad`, `\fade`, karaoke) are re-evaluated, and only changed style properties are
written. The DOM is released when the event ends.

### Supported tags

"Rendered" means drawn in the DOM; "parsed" means understood by the parser but not (fully) drawn.

| Tag | Status | Notes |
|---|---|---|
| `\pos` `\move(x1,y1,x2,y2[,t1,t2])` | rendered | First `\pos`/`\move` of the line wins (libass). |
| `\an` `\a` | rendered | First wins; legacy `\a` converted. |
| `\org` | rendered | Origin for `\frx \fry \frz`; first wins. Default: the anchor point. |
| `\fad` `\fade` | rendered | Line opacity (exact per component; overlapping parts composite like CSS). First wins. |
| `\clip` `\iclip` (rect) | rendered | CSS `clip-path`; last wins; animatable with `\t`. |
| `\clip` `\iclip` (vector, with scale) | rendered | CSS `clip-path: path()`; not animatable (as in libass). |
| `\t([t1,t2,][accel,]tags)` | rendered | Nested tags, optional times (line duration), acceleration, step when t2 <= t1. Animates `\fs \fsp \fscx \fscy \frx \fry \frz \fax \fay \bord \xbord \ybord \shad \xshad \yshad \blur \be`, colours, alphas and rect clips. Evaluated in source order with the other tags. |
| `\k` `\K` `\kf` `\ko` `\kt` | rendered | `\k`: colour switch; `\kf`/`\K`: left-to-right sweep; `\ko`: outline appears with the syllable. |
| `\r` `\r<style>` | rendered | Unknown style falls back to the line style. |
| `\fn` `\fs` (`\fs+n` / `\fs-n`) | rendered | Font family via `fontMap` or the name itself. |
| `\fscx` `\fscy` `\fsp` | rendered | |
| `\frx` `\fry` `\frz` `\fr` | rendered | 3D with a fixed perspective (312.5 layout px). |
| `\fax` `\fay` | rendered | Shear with the text top-left as pivot. |
| `\b` (0/1/100..900) `\i` `\u` `\s` | rendered | |
| `\bord` `\xbord` `\ybord` | rendered | CSS text stroke; uses the larger of x/y when they differ. |
| `\shad` `\xshad` `\yshad` | rendered | CSS text-shadow (box-shadow for BorderStyle 3). |
| `\blur` `\be` | approximate | CSS `blur()` over the whole fragment. |
| `\c` `\1c`..`\4c` `\alpha` `\1a`..`\4a` | rendered | `\2c`/`\2a` are used by karaoke. |
| `\p<n>` drawings (`m n l b s p c`) | rendered | SVG path, scaled by `2^(n-1)`; fill, outline, shadow, blur. |
| `\pbo` | rendered | |
| `\q0..3`, `WrapStyle` | rendered | 1: normal wrap, 2: no wrap (`\n` breaks), 0/3: CSS `text-wrap: balance` (approximation). |
| `\N` `\n` `\h` | rendered | |
| `\fe` | parsed | Ignored (no meaning for web fonts). |

Script level: `PlayResX/Y` (+ fallbacks), `ScaledBorderAndShadow`, `WrapStyle`, style fields incl.
`BorderStyle` 1 and 3, `Angle`, `Spacing`, `ScaleX/Y`, event margins and collision stacking for
unpositioned lines (lines already on screen keep their place). `LayoutResX/Y` is parsed but not used.

### Limitations

Honest list of what does not match libass (yet):

- **Glyph metrics.** The browser shapes and rasterizes text; `\fs` is mapped to CSS with a fixed ratio (0.9),
  so widths, line heights and hinting differ slightly from libass.
- **Not supported:** embedded fonts (`[Fonts]`), `[Graphics]`, the event `Effect` field (`Banner;`,
  `Scroll up;`, `Scroll down;`), LayoutResX/Y aspect-ratio correction (a script whose PlayRes aspect differs from
  the video is stretched, like VSFilter), BorderStyle 4, `\kf` sweep on drawings (they switch colour at the end).
- **Approximations:** `\blur`/`\be` blur fill and outline together; `\xbord` != `\ybord` uses the larger value;
  a fragment whose rotation differs from the first fragment of the line rotates around its own centre; a fragment
  whose `\fscx`/`\fscy` ratio differs becomes an inline-block (no line wrapping inside it); per-fragment shear
  differences are not rendered (the line uses the first fragment's `\fax`/`\fay`); spline close (`c`) is a straight close;
  a `\kf` syllable cannot wrap across lines.
- **Default for a missing `ScaledBorderAndShadow`** is `yes` (libass); VSFilter treats it as `no`.
- In headless Chromium on Linux we observed backslanted glyphs (positive `\fax`) drawn without the glyph slant;
  negative values render correctly. This is a rasterizer issue, not a PAR transform issue.

### Browser support

Evergreen browsers: Chrome/Edge 88+, Firefox 97+, Safari 13.1+ (CSS `clip-path: path()`, `ResizeObserver`).
Optional features degrade gracefully: `requestVideoFrameCallback` (else rAF), `paint-order` on HTML text
(Chrome 123+, Firefox, Safari; without it the outline also covers the inner half of the glyph edge),
`text-wrap: balance` (else greedy wrapping).

### Development

```sh
npm install
npm run dev        # demo at http://localhost:5173 (pick a video and an .ass file)
npm test           # vitest (jsdom)
npm run typecheck
npm run build      # dist/: par.js (ESM), par.cjs (CJS), par.global.js (IIFE, window.PAR), types/
npm run build:demo # demo-dist/: static site, relative paths (GitHub Pages ready)
```

Source layout: `src/parser` (file + tag parsing), `src/anim` (time evaluation), `src/layout` (region, scaling,
anchors, collisions), `src/render` (DOM/SVG/CSS), `src/clock` (render loop, video events), `src/core` (public renderer).

License: MIT, (c) Pulsariums.
