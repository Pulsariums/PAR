# WebAssembly kernels (Rust)

Status: XPAR/PAR stream coder only. Code: `rust/par-wasm` (Rust, `no_std`, no dependencies, plain `extern "C"` exports, no wasm-bindgen),
loader and glue in `src/wasm/`, embedded as base64 in `src/wasm/wasmBytes.ts` (about 14 KB of text, one binary, no hosted file).

* **Output is unchanged.** The Rust coder is a bit-exact twin of `src/format/rcCore.ts` / `rcSym.ts` (same f64 arithmetic on f32 tables, tables handed over from JS).
  `test/wasm-rc.test.ts` checks, on real chunks of every benchmark profile, on fuzzed stream sets and on damaged data, that TS and WASM give the same bytes (or the same error), in both directions. Old files decode, new files are identical: no format change.
* **Lazy and silent.** Compiled on the first coded block, only on the XPAR/PAR encode and decode paths (workers, CLI, converter); never on the render path. No `WebAssembly`, a CSP that forbids it, or any failure: the TypeScript coder runs, same bytes. No option.
* **Build.** `npm run build:wasm` (needs `rustup target add wasm32-unknown-unknown`) rebuilds the binary and regenerates `wasmBytes.ts`; `npm run check:wasm` (no Rust needed) verifies the committed binary against the hash of the Rust sources.

## Where the time goes (profile, 63 MB synthetic `a-text-24`, Node 22, one thread, TS only)

| stage | total | main costs |
|---|---|---|
| encode | 26 s | numeric-vector search (`vec.ts`) 48 %, entropy coder 23 %, tokeniser 10 % |
| decode | 10.5 s | entropy coder 55 %, structure/text printing 30 %, GC 14 %, SHA-256 ~5 % |
| bake | 28 s | vector search 23 %, entropy coder 18 %, rest render-bake |
| optimize (127 MB) | 343 s | GC 53 %, drawing-order placement 25 %; `fit`/`verify` under 3 % |
| analyze (127 MB) | 55 s | GC 33 %, rest spread over parsers |

## Measured (same machine; `NO_WASM=1 node tools/xpar/run.mjs prof-stage <encode|decode> file`)

| routine | TS | WASM | speedup | bytes |
|---|---|---|---|---|
| entropy decode only (22 MB raw, 119 M binary decisions) | 5.65 s | 3.3 s | 1.7x | identical |
| XPAR decode e2e (63 MB) | 10.4 s | 8.0 s | 1.3x | identical |
| XPAR encode e2e (63 MB) | 24.3 s | 21.6 s | 1.12x | identical (2,313,145 B) |

Native Rust runs the same decode in 2.4 s: the coder is a serial chain (about 65 cycles of table load, mixing, squash, range step per decision), so no language gets far past 2x.

## Not done, and why

* **SHA-256**: 140 MB/s in JS = 6 % of decode; WASM would save about 3 %. Rejected (< 1.5x). In Node, `node:crypto` is 12x faster than the JS one; that is a CLI injection, not Rust.
* **Optimizer `fit`/`verify`, analyzer scan**: under 3 % / flat profile dominated by GC and parsers shared with the player. Nothing to gain.
* **Vector search in encode (`vec.ts`, 48 % of encode)** and **structure decode/printing (30 % of decode)**: the only ports that would reach 2x end to end, but they need the history rings and the text model in linear memory; not finished and not verified, so not included.
* Bigger lever, not Rust: chunks are independent, so decoding or encoding them on several workers scales with cores.

Caveats: measured on Node only, single run each, synthetic data; browsers differ. Dist size: about 14 KB more in `source.js`, `source.worker.js` and their `.cjs` twins; `par.js` and the player are unchanged. Memory of a WASM instance does not shrink; an instance above 160 MB is dropped after the job.
