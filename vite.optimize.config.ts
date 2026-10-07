import { defineConfig } from 'vite';

// `pulsar-ass-renderer/optimize`: the frame-by-frame optimizer (optimizeAss). It reads the text model of the format code, so it is its own
// entry; the core bundle does not know it.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    target: 'es2020',
    lib: {
      entry: 'src/optimize/index.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'optimize.js' : 'optimize.cjs'),
    },
  },
});
