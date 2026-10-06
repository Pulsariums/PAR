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
· `3` verbatim lines `(line number delta, bytes)` · `4` line-ending exceptions · `5` embedded fonts (placeholder:
name, offset, length, crc32; blobs stored raw between header and chunks) · `6` free-form JSON parameters (PAR) ·
`7` provenance `{kind, sha256[32], source bytes, source duration ms, fps x1000, encoder id}`.

**Index block**: per chunk `offset (delta), len, rawLen, codec, lane, event count, minStartMs, maxEndMs, minLine,
maxLine, crc32`. A window `[t0,t1)` needs exactly the chunks with `minStartMs < t1` and `maxEndMs > t0`. Events
are *not* required to be sorted: each chunk carries its own time bounds. Events lasting 20 s or more go to a
separate **lane** so one long sign does not widen every chunk; there is no carry-over of events between chunks (an
event lives in exactly one chunk, found through `maxEndMs`).

**Chunk**: closes after ~512 KiB of source text, or once it spans 2 s of start times and holds >= 32 KiB, or 120 s.
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
* Embedded fonts are a placeholder: stored raw, listed in `file.fonts`; integration with `src/fonts` is future work.
