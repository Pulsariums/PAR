import { defineConfig } from 'vite';

// `pulsar-ass-renderer/worker`: the module Worker that indexes / decodes a source off the main thread. Self-contained.
// Use: new Worker(new URL('pulsar-ass-renderer/worker', import.meta.url), { type: 'module' })
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    target: 'es2020',
    lib: { entry: 'src/source/worker.ts', formats: ['es'], fileName: () => 'source.worker.js' },
  },
});
