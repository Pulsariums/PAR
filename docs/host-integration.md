# Host integration notes: "PAR settings" and the PAR font library

For apps that embed PAR (Pulsar Editor, Fansub Architect, any web player). PAR stays autonomous: it needs nothing from the host. Everything below is a recommendation for the host UI, built on `pulsar-ass-renderer/fontlib` (a separate entry the core never imports).

## Legal and product rules

- PAR does not host or distribute fonts and offers no shared font hosting. The library is the user's own local store (IndexedDB on their device).
- Any syncing of font files (for example to the user's own Drive) is a **host concern**, not part of PAR. Mind font licenses; do not build a public font bucket.

## Wiring

```ts
import { create } from 'pulsar-ass-renderer';
import { FontLibrary } from 'pulsar-ass-renderer/fontlib';

const library = await FontLibrary.open('par-fonts');          // once per app
const par = create({
  video, subtitle,
  fontProviders: [library.asProvider()],                      // library changes are picked up automatically (subscribe)
  onMissingFonts: () => 'continue',                            // the host decides in the event handler below
});
par.on('missingfonts', (report) => { if (settings.askWhenMissing) showPrompt(report); });
```

Use `createMissingFontsPrompt(container, report, { onContinue, onAddFonts, texts })` or build your own from `report.missing[]` (names) and `report.missingGlyphs` (font present, characters absent). "Continue" = `par.continueWithMissing()` (only needed after a `'wait'` decision). "Add font" = open the library upload.

## Settings fields (PAR settings > Fonts)

| Field | Backed by | Notes |
| --- | --- | --- |
| Library list | `library.list()` | Metadata only, cheap. Group by `family` (Regular / Bold / Italic under one heading), search over `family`, `aliases`, `fullNames`, `file`. |
| Upload | `library.add(files)` | Accepts font files and `.zip`. Returns `{ added, duplicates, errors }`; show each error (corrupt files fail alone). Call `requestPersistence()` right after, inside the click handler. |
| Names / alias | `library.setAliases(id, names)` | The family inside the file always works; aliases add names a script may use. |
| Delete / bulk delete | `library.remove(ids)` | Confirm first. |
| Preview | `library.bytes(id)` + `FontFace`, `library.coverage(id)` | Draw sample text; show characters the font lacks as boxes. `sliceCps(coverage, from, 96)` pages a character grid, `blockStats` gives a block jump list, `scriptBadges` the coverage badges. The playground (`site/src/playground/lib*.ts`) is a working reference. |
| Storage use | `library.usage()` | `{ bytes, used, quota, ratio, warn, persisted }`. Warn at `warn` (80 %); disable uploads when `ratio` is near 1. |
| Keep on this device | `library.requestPersistence()` | Ask once after the first upload; show the result (`persisted`). |
| Export | `library.exportZip()` | Backup. Uncompressed zip plus `manifest.json`. |
| Ask when fonts are missing | host setting | Toggle that decides whether `missingfonts` shows the prompt. |
| Default behaviour | host setting | `continue` (draw fallback) or `ask`. Use `'wait'` only if the host really wants lines hidden until the user answers; return a Promise from `onMissingFonts` that resolves when the prompt is answered. |

## Check before playing

```ts
const report = await preflightScript(assText, { fontProviders: [library.asProvider()] });
if (!report.ok) openFontDialog(report.missing);
```

Works without a DOM renderer; for very large files pass lines (`linesFromChunks(response.body)`) or a precomputed `usedFonts` list.

## Optional: syncing font files (host side, not PAR)

If the host keeps the user's fonts in cloud storage (their own Drive):

- **Dedupe by hash**: the library id is the SHA-256 (first 128 bits) of the font bytes. Use the same hash as the remote file key so a font is stored once everywhere.
- **Lazy download**: sync metadata (`list()`), fetch bytes only when a script needs the family (implement a second `FontProvider` that downloads on `get()` and then calls `library.add()`), or on explicit "download all".
- **Size caps**: refuse single files above a limit (fonts with large CJK sets reach 15 MB+), and stop at the quota the browser reports.
- Never expose a shared link to the font files; they are the user's licensed copies.

## Big scripts: feeding a `SubtitleSource`

For scripts that should not be loaded whole (100 MB+ typesetting, `.xpar`, `.par`) give PAR a `SubtitleSource` instead of text. The renderer keeps a sliding window (`windowSeconds`, default 12: about 2 s behind the playhead, 10 s ahead), reads ahead in slices, cancels reads a seek made stale, evicts old events and draws nothing for a time whose events are not loaded yet. `par.getSourceStats()` gives `{ windowEvents, windowRange, loading, bytesRead, decodeMs, indexMs }` for a status line.

```ts
import { create } from 'pulsar-ass-renderer';
import { openSourceInWorker } from 'pulsar-ass-renderer/source';

const controller = new AbortController();                       // wire to a Cancel button
const source = await openSourceInWorker(fileOrBlob, {           // .ass / .ssa / .xpar / .par, sniffed from the content
  worker: () => new Worker(new URL('pulsar-ass-renderer/worker', import.meta.url), { type: 'module' }),
  onProgress: (bytes, total) => progress.set(bytes / total),   // indexing a plain ASS streams the file once
  signal: controller.signal,
});
const par = create({ video, subtitle: source, fontProviders: [library.asProvider()] });
// later: par.setSubtitle(otherSource | text | null); the old source is closed (its Worker terminated)
```

- **Worker.** `pulsar-ass-renderer/worker` is a self-contained module Worker (`dist/source.worker.js`). The Worker indexes the file, reads and parses windows and posts plain events back, so the main thread never decodes. Bundlers that understand `new Worker(new URL(..., import.meta.url))` (Vite, webpack 5, Rollup plugins) pick it up; otherwise serve the file yourself and pass `worker: () => new Worker('/static/par-source.worker.js', { type: 'module' })`. Without a Worker (`worker: null`) the same adapters run on the main thread in async chunks (`Blob.slice` reads, no whole-file string).
- **What a source is.** `{ kind, script: { info, styles, warnings }, duration, eventCount, readWindow(t0, t1, signal?) => Promise<AssEvent[]>, prefetch?, fontSection?, stats?, close? }`. `readWindow` returns the events visible in `[t0, t1)` (half-open on integer ms, see `inWindow`) with the ids / `index` values `parseScript` would give. Implement it for any backend (your own database, an HTTP API); `signal` is aborted when a seek makes the read stale. `prefetch(t0, t1)` is an optional hint you may call yourself (the renderer does not need it).
- **Remote files.** `fromXpar(url)` / `fromPar(url)` read with HTTP Range (the server must answer `206`); a plain `.ass` URL has to be fetched into a Blob first (or wrapped in your own source).
- **Fonts.** Starting set: the fonts the styles name. Fonts used in `\fn` overrides are added when their window is read. Embedded fonts come from `source.fontSection()` (a plain ASS file records the byte range of `[Fonts]` while indexing). For an up-front check without playing, run `preflightScript(linesFromChunks(blob.stream()))` once (streams the file, memory-bounded) and show the prompt before opening.
- **Size.** Windows of very dense scripts are big: the benchmark script with about 7 000 events per second held 35 000 events in a 5.4 s window and the page's JS heap sat near 90 MB (about 50 MB without a file). Lower `windowSeconds` for such files.
- **Time rule.** All window and visibility compares use integer milliseconds with `[start, end)`: see [timing](./timing.md).
