import { defineConfig } from 'vite';

// `pulsar-ass-renderer/analyze`: the script analyzer (analyzeAss, analyzeSource): burst map, sprite keys, canvas eligibility. Its own
// entry; the core bundle does not know it.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    target: 'es2020',
    lib: {
      entry: 'src/analyze/index.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'analyze.js' : 'analyze.cjs'),
    },
  },
});
