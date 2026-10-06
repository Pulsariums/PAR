import { defineConfig } from 'vite';

// `pulsar-ass-renderer/source`: adapters for big files (fromAssFile, fromXpar, fromPar, openSourceInWorker). Pulls in the XPAR
// reader, so it is its own entry; the core bundle only knows the SubtitleSource interface.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    target: 'es2020',
    lib: {
      entry: 'src/source/index.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'source.js' : 'source.cjs'),
    },
  },
});
