# XPAR: lossless, seekable container for ASS subtitles

Status: **prototype, Phase A** (format version 1.0, encoder id `pulsar-xpar/1.0`). Code: `src/format/`.
Not wired into `PAR.create` yet.

XPAR stores an `.ass` file so that **`decode(encode(x))` is `x`, byte for byte**, for every input: any bytes, any
line endings, BOM or none, invalid UTF-8, unknown sections. The container is organised in time chunks, each
independently decodable, with an index at the end so a reader can fetch only what it needs
(`Blob.slice`, HTTP `Range`). It is made for files that are *huge because of frame-by-frame typesetting*
(thousands of lines per second), but works for normal episodes too.

| | |
|---|---|
| Extension / MIME (proposal) | `.xpar` / `application/vnd.pulsar.xpar` |
| Lossy sibling | `.par`, see [PAR.md](PAR.md). Same container, flag bit 0 set. Never confuse the two. |
| Magic | `58 50 41 52` (`XPAR`), ends with `XEND` |
| Byte order | little endian; varints are LEB128, signed values zigzag |
| Runtime dependencies | none (own range coder; `CompressionStream` only if you opt into the `deflate` codec) |

## Round-trip guarantee

*Byte exact.* This is enforced, not assumed:

1. A file is split at `LF`. A trailing `CR` before it is the line terminator `CRLF`; a lone `CR` stays inside the line.
   The terminator style is stored once (`crlf`) plus the list of lines that deviate, and whether the file ends with a
   terminator. A BOM at the start is a flag.
2. Only lines inside an `[Events]` section that are `Dialogue:` / `Comment:` with a **canonical** spelling are
   modelled. Canonical means that printing the parsed fields gives the original line again (times as `H:MM:SS.cc`,
   integers without leading zeros or `+`, numbers such as `.5`, `1e3`, `-0`, `01` are not canonical, ...). The encoder
   re-prints every modelled line and compares it with the input, and every text field again. A mismatch demotes
   the line (or the tag piece) to a verbatim string. There is no code path that guesses.
3. Everything else is stored verbatim: all other lines (script info, styles, other sections, blank lines, comments,
   anything that is not valid UTF-8), event lines with another `Format:` layout or odd spelling, tag pieces the
   tokenizer does not understand (kept as raw text, so unknown tags survive).
4. The encoder stores the SHA-256 of the original bytes. `XparFile.toAss()` re-computes it and fails with
   `CHECKSUM` if it differs. Round trip of every benchmark profile, the repository fixtures and the odd inputs is in
   `test/format-roundtrip.test.ts` (CRLF, mixed endings, BOM, empty file, lone CR, 5 MB single line, binary garbage,
   unknown sections, non-canonical numbers, ...).

A file that is not ASS at all still round-trips (it is just all verbatim lines).

## Layout

```
header (16) | font blobs | chunk 0 | chunk 1 | ... | meta block | index block | footer (52)
```

**Header**: `"XPAR"`, `major u8`, `minor u8`, `flags u16`, `reserved u32 = 0`, `crc32(first 12 bytes) u32`.
Flags: bit 0 `LOSSY` (PAR), bit 1 `STORED` (see below). Unknown bits of the low byte are **critical**: a reader must
refuse the file. Other bits are ignorable.

**Stored form** (`flags & 2`): header, then the ASS bytes verbatim, then `crc32(payload) u32`. The encoder emits it
whenever the modelled container would not be smaller (tiny or incompressible input), so
**`encodeXpar(x).length <= x.length + 20`** always holds (inputs up to 8 MiB are checked this way; for bigger streams
the modelled container is orders of magnitude smaller anyway). `openXpar` re-encodes a stored payload in memory,
so callers see no difference.

**Footer** (last 52 bytes): `meta {offset u64, len u32, rawLen u32, crc32 u32}`, `index {same}`, `metaCodec u8`,
`indexCodec u8`, 2 reserved bytes, `crc32(first 44 bytes) u32`, `"XEND"`. A truncated file has no `XEND`, which gives
a precise `TRUNCATED` error. A reader needs 52 bytes from the end, then the meta and index blocks, nothing else.

**Block codecs** (stored per block, so a file may mix them): `0` stored, `1` deflate-raw (optional, via
`DecompressionStream`), `2` stream coder (the default, below), `3` the same coder over flat bytes (meta/index).

**Meta block**: sections `{id uv, len uv, body}`; unknown ids are skipped (forward compatibility).
`1` info (flags bom/crlf/final-newline, line count, event count, dialogue count, duration ms) · `2` event Format layouts
· `3` verbatim lines `(line number delta, bytes)` · `4` line-ending exceptions · `5` embedded fonts, old form (name, offset, length, crc32; raw blobs; still read) · `8` embedded fonts
(name, offset, stored length, original length, codec `0` stored / `1` raw deflate, crc32 of the original bytes; blobs between header and chunks) · `6` free-form JSON parameters (PAR) ·
`7` provenance `{kind, sha256[32], source bytes, source duration ms, fps x1000, encoder id}`.

**Index block**: per chunk `offset (delta), len, rawLen, codec, lane, event count, minStartMs, maxEndMs, minLine,
maxLine, crc32`. A window `[t0,t1)` needs exactly the chunks with `minStartMs < t1` and `maxEndMs > t0`. Events
are *not* required to be sorted: each chunk carries its own time bounds. Events lasting 20 s or more go to a
separate **lane** so one long sign does not widen every chunk; there is no carry-over of events between chunks (an
event lives in exactly one chunk, found through `maxEndMs`).

**Chunk**: closes after ~512 KiB of source text, or once it spans 2 s of start times and holds >= 128 KiB, or 30 min. Seek granularity is therefore *bytes first*: a dense file gets a chunk per ~0.1-0.2 s of video, a sparse episode one chunk per 128 KiB (about the whole episode). A 2 s time grid was measured to cost ratio (a normal 24 min episode: 6.9x with ~10 KiB chunks, 10.7x as one chunk).
It is a *stream set*: `uv n`, `n x (uv key, uv length)`, then the bodies. The chunk is independent: dictionaries and
numeric histories restart in every chunk. CRC-32 of the stored bytes is in the index; `rawLen` bounds decoding.

## Structure-aware transform (before entropy coding)

Per event (columns, one stream each): kind (dialogue/comment/verbatim), line number delta, dialogue ordinal delta
(ids of `parseScript` stay identical), layer, start delta (centiseconds), duration, style / name / effect (chunk
dictionary), margins, text.

**Text** is tokenised losslessly (`textModel.ts`): literal runs, `{...}` blocks with a *comment prefix* and a list of
tag pieces. Known tags (`\pos \move \org \fad \fade \clip \iclip \t \fscx ... \1c \alpha \p \k ...`, nested `\t`,
vector `\clip`) become `(tag id, flags)` plus exact decimal numbers `(mantissa, decimals)`, so `1.50` and `1.5` stay
different. Colours are integers plus a digit count. Drawings (`m 0 0 l ...`) become a *shape* (command letters and
counts, interned per chunk) plus coordinate numbers. Anything else is a verbatim piece.

**Numeric prediction** ("only what changed since the last frame"): all numbers of a line form a vector. Lines with
the same *structure signature* (same tags, same shapes) keep a history. Each line is coded against one earlier line of
its history, chosen by the encoder (`vec.ts`): a distance (usually the same as for the previous line: particles keep
their order from frame to frame; the encoder re-acquires the lock after births and deaths), and either first order
(`value - base`) or constant velocity (`value - (base + velocity)`). Lines without a good predecessor are coded
against zero (drawings: against the coordinate two numbers earlier). Residuals go to one stream per tag argument
(`\pos` x, `\pos` y, `\frz`, ...), decimal counts to one stream per slot. The decoder only replays the references.

## Entropy coder (`rc.ts`, `rcSym.ts`, `rcCore.ts`)

Adaptive binary range coder (32-bit carry-less, 12-bit probabilities), three context models mixed in the logistic
domain with learned weights chosen by (stream key, decision class). **Context = stream key** (field kind, tag id,
argument index) **+ the previous values of that stream** (magnitude class, exact value, two classes back). Numeric
streams are coded as numbers: zero flag, unary bit length, first three mantissa bits modelled, the rest nearly raw.
The string stream is coded as bytes (order 0/1/2). Written from scratch for this project; no third-party code.

Why not deflate / zstd / brotli as the core? They are general purpose and see the already-transformed streams as bytes.
`DecompressionStream('deflate-raw')` is available everywhere but has no model of these streams; zstd and brotli need
WASM or are not in `DecompressionStream` (support varies by browser and is unverified here). They were used only as
**measurement baselines** (see the table below) and `codec: 'deflate'` stays available as an optional faster-decoding
mode. `xpar + gzip` of the whole file is measured too (it gains almost nothing).

## API (`src/format/index.ts`)

```ts
encodeXpar(input: string | Uint8Array | Blob | ReadableStream | AsyncIterable, opts?): Promise<Uint8Array>
encodeXparTo(input, sink, opts?): Promise<void>            // streams; chunks go to sink as they complete
openXpar(source: Blob | Uint8Array | URL string | ByteSource): Promise<XparFile>
file.readWindow(t0, t1): Promise<AssEvent[]>                // same structures and ids as parseScript
file.readWindowText(t0, t1)                                 // mini ASS (header + events) for any consumer
file.toAss(): Promise<Uint8Array>                           // byte exact, verified against the stored SHA-256
file.toAssTo(sink), file.script, file.duration, file.fonts, file.meta, file.provenance
parHeader(file), openPar(source), sniff(bytes), parFileName(base, fps), FILE_TYPES
indexAss(blob): Promise<AssIndex>                           // plain ASS, no conversion; see below
```

`opts`: `codec` (`'rc'` default, `'deflate'`, `'stored'`), `chunkBytes`, `chunkMs`, `minChunkBytes`, `maxSpanMs`,
`longMs`, `fonts`, `onProgress({bytesIn, bytesOut, events, fraction})`, `totalBytes`, `signal: AbortSignal`
(rejects with `XparError('ABORTED')`). All functions are pure and DOM-free: they run in a Worker as they are. Input is
processed in 1 MiB slices; **the file is never held as one string** (lines are decoded one at a time; memory is bounded
by the open chunks).

Errors are `XparError` with a stable `code`: `BAD_MAGIC BAD_VERSION TRUNCATED CORRUPT CHECKSUM LIMIT UNSUPPORTED IO
INVALID_INPUT ABORTED`.

### Plain ASS without conversion: `indexAss`

Streams the file once (`Blob.stream()`), keeps only an index: runs of consecutive event lines (<= 256 KiB each) with
byte offset, length, min start, max end, first dialogue ordinal. Unsorted files work (each run has its own bounds);
long events get runs of their own. `readWindow` slices the Blob/HTTP range of the matching runs and parses only those
lines. Roughly: ids are identical to a full parse. The index is plain data (`index.data`), so it can be built in a
worker and posted to the main thread.

## Versioning and compatibility

* `major` changes break readers (`BAD_VERSION`). `minor` only adds things old readers can ignore.
* New meta sections get new ids; readers skip unknown ones. New block codecs get new ids; a reader that does not know
  one fails with `UNSUPPORTED` naming it. New header flag bits in the low byte are critical, in the high byte ignorable.
* The stream key map and the text-model tag ids are part of the format version.

## Security

* Every offset, length and count read from the file is validated before use: blocks must lie inside the file, inside
  the data area; `rawLen` is capped (64 MiB per chunk, 256 MiB meta), index entries (4 M), streams per chunk (4096),
  events per chunk (4 M), vector length (1 M), string length (64 MiB).
* **Decompression bombs**: decoders are told the expected raw size from the checksummed index and refuse more
  (`LIMIT`); the deflate path aborts the stream as soon as it exceeds the declared size.
* Chunk and metadata CRCs are checked before decoding; corruption is reported per chunk (other chunks stay readable).
* No `eval`, no `Function`, no dynamic code; JSON is parsed only for the PAR parameter section.
* A random-corruption test (`test/format-robust.test.ts`) asserts that damaged files only ever raise `XparError`.
* Not covered: CRC-32 is an integrity check, not authentication. Sign the file or hash it separately if you need that.

## Limitations

* Lone `CR` line endings are treated as text inside one very long line: still exact, not efficient.
* A scrambled file (events not in time order) is correct but chunks widen; windows then touch more chunks. Full
  decode of such a file needs the chunks that overlap in line numbers in memory at once (worst case: the whole file).
* Lines whose `Format:` differs from the standard V4+ layout are stored verbatim (exact, no modelling gain).
* Chunks restart their statistics: smaller chunks seek faster and compress worse (measured below).
* Decoding speed is bounded by the entropy coder (see the numbers); `codec: 'deflate'` decodes about 3x faster for
  about 10-25 % more bytes.
* Embedded fonts (`EncodeOptions.fonts`, `xpar encode/par bake --font file|dir`) are **lossless**: whole files, never subset or re-encoded. A font is deflated only when that saves at least 3 % (WOFF, WOFF2 and most CJK fonts are compressed already and stay as they are); `file.fonts[i].read()` returns the original bytes and checks the CRC-32. Identical fonts (name, size, crc) are stored once. `fromXpar` hands the fonts to the player as ordinary `[Fonts]` data, so a converted file plays with its fonts without a second step. `xpar fonts file.xpar [outDir]` lists or extracts them.

## Measured results

**All data is SYNTHETIC** (`tools/xpar/gen-bench.ts`, seed 1): particle effects per frame (a), morphing per-frame vector
drawings (b), a 24 min dialogue/karaoke/sign episode (c). It is built to look like Aegisub-Motion / templater output
(2-3 decimals, trailing zeros stripped, frame lines spanning frame midpoints), but real files will differ: the owner's
real 200 MB sample is still to be measured. Setup: one machine (4 cores, Node 22.22), single thread, `xz -9e`,
`zstd -19` (window 2^27), `brotli q9` and `gzip -9` run as dev-time baselines only (never at runtime). Sizes are
files, MB = 2^20 bytes. Reproduce: `npm run xpar:gen`, `node tools/xpar/run.mjs bench <file> xpar|index|bake|base`, `... report <dir>`.

### Size (lossless) and ratio vs source

| profile | source MB | gzip -9 | deflate-raw 6 | brotli q9 | zstd 19 | xz -6 | xz -9e | XPAR deflate | **XPAR (own coder)** | XPAR + gzip |
|---|---|---|---|---|---|---|---|---|---|---|
| a-text-60 | 160.44 | 29.96 MB (5.4x) | 30.79 MB (5.2x) | 25.14 MB (6.4x) | 21.04 MB (7.6x) | 20.09 MB (8.0x) | 17.58 MB (9.1x) | 6.09 MB (26.3x) | **5.05 MB (31.8x)** | 5.04 MB (31.8x) |
| a-text-24 | 64.17 | 11.91 MB (5.4x) | 12.25 MB (5.2x) | 10.06 MB (6.4x) | 8.71 MB (7.4x) | 8.22 MB (7.8x) | 7.34 MB (8.7x) | 2.65 MB (24.2x) | **2.21 MB (29.1x)** | 2.20 MB (29.1x) |
| b-draw-24 | 74.33 | 24.51 MB (3.0x) | 24.56 MB (3.0x) | 20.43 MB (3.6x) | 17.65 MB (4.2x) | 17.51 MB (4.2x) | 15.31 MB (4.8x) | 8.29 MB (9.0x) | **7.58 MB (9.8x)** | 7.58 MB (9.8x) |
| c-episode | 0.14 | 0.02 MB (7.5x) | 0.02 MB (7.5x) | 0.02 MB (8.0x) | 0.02 MB (8.6x) | 0.01 MB (9.2x) | 0.01 MB (9.4x) | 0.02 MB (7.1x) | **0.02 MB (6.9x)** | 0.02 MB (7.0x) |

### Speed and seek cost (single thread, Node 22, one machine; MB/s of SOURCE text)

| profile | codec | encode MB/s | decode all MB/s | chunks | chunks per 2 s window | 2 s window ms (cold) | 1 frame window ms (cold) | byte exact |
|---|---|---|---|---|---|---|---|---|
| a-text-60 | rc | 2.7 | 5.04 | 321 | 12 | 1476 | 94 | true |
| a-text-60 | deflate | 3.5 | 13.56 | 321 | 12 | 825 | 38 | true |
| a-text-24 | rc | 2.2 | 5.51 | 129 | 5 | 602 | 89 | true |
| a-text-24 | deflate | 2.63 | 13.68 | 129 | 5 | 391 | 43 | true |
| b-draw-24 | rc | 3.23 | 4.77 | 149 | 6 | 822 | 112 | true |
| b-draw-24 | deflate | 5.32 | 12.59 | 149 | 6 | 369 | 55 | true |
| c-episode | rc | 1.08 | 2.6 | 14 | 1 | 2 | 1 | true |
| c-episode | deflate | 1.65 | 4.23 | 14 | 1 | 1 | 1 | true |

### Plain-ASS index (no conversion)

| profile | source MB | index time s | MB/s | runs | events | peak RSS MB | heap after index MB | 2 s window ms |
|---|---|---|---|---|---|---|---|---|
| a-text-60 | 160.44 | 2.5 | 63.2 | 642 | 1139872 | 62.67 | 5.42 | 538 |
| a-text-24 | 64.17 | 1.1 | 57 | 257 | 456856 | 61.76 | 5.37 | 274 |
| b-draw-24 | 74.33 | 0.6 | 129.7 | 298 | 244713 | 60.33 | 5.37 | 208 |
| c-episode | 0.14 | 0 | 10.3 | 1 | 1027 | 0 | 5.22 | 15 |


Memory (peak RSS of the whole Node process, baseline of an idle Node is ~45-60 MB): encoding the 160 MB profile
117 MB; indexing the plain 160 MB ASS 63 MB RSS and 5.4 MB heap for 1.14 M events and 642 runs; baking 160 MB: 176 MB.
Nothing scales with file size beyond the open chunks (about 512 KiB of source each) and the index.

Reading the numbers honestly:
* On frame-by-frame data XPAR is 3.5x (profile a) and 2.0x (b) smaller than `xz -9e` and 5-7x smaller than gzip;
  with the deflate codec instead of the own coder it is still 2.8x / 1.8x smaller than xz. Gzip over an `.xpar` gains <0.5 %.
* The own coder buys 10-25 % over deflate on the same transform, at a cost: decoding is ~2.7x slower
  (5 vs 13.6 MB/s of source), 1-frame seek 90-110 ms vs 40-55 ms. A 2 s window of the densest profile needs
  1.5 s of CPU (the profile has 19k events/s: 12 chunks). In a worker that keeps up with playback (decode 5 MB/s vs 2.7 MB/s
  of subtitle text per second of video) with a margin of about 2x, not more.
* On the normal episode (142 KB) XPAR (default single chunk) reaches ~10.7x against xz -9e 9.4x, gzip 7.5x (the table
  above was measured before the chunk defaults were raised and shows 6.9x with 14 small chunks).
  Gains on normal files are small; their value is the guarantee, seekability and tiny files, not ratio.
* Encoding is 2-3 MB/s (160 MB in 60 s): the tokeniser and the coder are plain JS; fine for an export step, slow for
  interactive use on a 200 MB file.
* Chunk size trades ratio for seek latency: for profile b, 512 KiB chunks give 10.0x, 128 KiB 6.3x, 64 KiB 4.6x
  (history and coder statistics restart per chunk).
