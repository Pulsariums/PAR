// The project has no @types/node (zero deps); tests only need these four zlib calls.
declare module 'node:zlib' {
  export function deflateSync(data: Uint8Array): Uint8Array;
  export function deflateRawSync(data: Uint8Array): Uint8Array;
  export function brotliCompressSync(data: Uint8Array): Uint8Array;
  export function brotliDecompressSync(data: Uint8Array): Uint8Array;
}
