import { defineConfig } from 'vite';

// The font library is its own entry (`pulsar-ass-renderer/fontlib`): a small, self-contained chunk next to the core
// bundle. The core never imports it. Built after the main bundle (which empties `dist`), so `emptyOutDir` is off.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    target: 'es2020',
    lib: {
      entry: 'src/fontlib/index.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'fontlib.js' : 'fontlib.cjs'),
    },
  },
});
