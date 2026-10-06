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
