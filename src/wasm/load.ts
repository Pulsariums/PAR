import { WASM_B64 } from './wasmBytes';

/**
 * Lazy, silent WebAssembly loader. Nothing is compiled until a routine asks for it, and any failure (no `WebAssembly`, a CSP that forbids it,
 * a broken engine) is remembered and answered with `null`: the caller then runs its TypeScript twin, which produces the same bytes.
 */
export interface Kernels {
  memory: WebAssembly.Memory;
  heapBase: number;
  rc_encode(job: number): number;
  rc_decode(job: number): number;
}

/** A module that grew past this is dropped after the call (linear memory never shrinks); the compiled module is kept. */
const DROP_AT = 160 << 20;

let enabled = true;
let module: Promise<WebAssembly.Module | null> | undefined;
let live: Kernels | null = null;

/** Internal switch (tests, benchmarks): `false` forces the TypeScript paths. Not part of the public API. */
export const setWasmEnabled = (on: boolean): void => {
  enabled = on;
};

const decodeB64 = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const compile = async (): Promise<WebAssembly.Module | null> => {
  try {
    if (typeof WebAssembly === 'undefined') return null;
    return await WebAssembly.compile(decodeB64(WASM_B64) as BufferSource);
  } catch {
    return null;
  }
};

const instantiate = (m: WebAssembly.Module): Kernels | null => {
  try {
    const e = new WebAssembly.Instance(m, {}).exports as Record<string, unknown>;
    const heap = (e.__heap_base as WebAssembly.Global).value as number;
    return { memory: e.memory as WebAssembly.Memory, heapBase: (heap + 15) & ~15, rc_encode: e.rc_encode as Kernels['rc_encode'], rc_decode: e.rc_decode as Kernels['rc_decode'] };
  } catch {
    return null;
  }
};

/** The kernels, or `null` when WebAssembly is unavailable or switched off. Safe to call from any thread and as often as needed. */
export const kernels = async (): Promise<Kernels | null> => {
  if (!enabled) return null;
  if (live) return live;
  module ??= compile();
  const m = await module;
  if (!m) return null;
  live ??= instantiate(m);
  return live;
};

/** Called after a job: releases a bloated instance so a worker does not keep hundreds of MB after one huge chunk. */
export const settle = (): void => {
  if (live && live.memory.buffer.byteLength > DROP_AT) live = null;
};

/** After an unexpected failure: forget the instance (a fresh one is made on the next call). */
export const drop = (): void => {
  live = null;
};
