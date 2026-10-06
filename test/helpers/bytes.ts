export const concat = (parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/** A zeroed buffer with a DataView for little-endian record writing. */
export const record = (size: number): { b: Uint8Array<ArrayBuffer>; v: DataView } => {
  const b = new Uint8Array(size);
  return { b, v: new DataView(b.buffer) };
};
