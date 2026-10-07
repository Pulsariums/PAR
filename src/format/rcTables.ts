/** Logistic lookup tables of the predictor (f32). Shared with the WebAssembly coder, which receives these exact values. */
export const STRETCH = new Float32Array(4096);
export const SQUASH = new Float32Array(4096);
for (let i = 0; i < 4096; i++) {
  const p = (i + 0.5) / 4096;
  STRETCH[i] = Math.log(p / (1 - p));
  SQUASH[i] = 1 / (1 + Math.exp(-((i - 2048) / 170.667)));
}
