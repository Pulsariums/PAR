import { defineConfig } from 'vite';

const FILES: Record<string, string> = { es: 'par.js', cjs: 'par.cjs', iife: 'par.global.js' };

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2020',
    lib: {
      entry: 'src/index.ts',
      name: 'PAR',
      formats: ['es', 'cjs', 'iife'],
      fileName: (format) => FILES[format] ?? `par.${format}.js`,
    },
  },
});
