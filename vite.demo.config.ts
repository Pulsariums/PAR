import { defineConfig } from 'vite';

// Demo: `npm run dev` serves it, `npm run build:demo` emits a static site (relative base => GitHub Pages ready).
export default defineConfig({
  root: 'demo',
  base: './',
  build: { outDir: '../demo-dist', emptyOutDir: true },
});
