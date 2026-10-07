import { defineConfig } from 'vite';

// Static site for GitHub Pages (project page https://pulsariums.github.io/PAR/). Imports PAR from ../src.
export default defineConfig({
  root: 'site',
  base: '/PAR/',
  worker: { format: 'es' },
  build: {
    outDir: '../site-dist', emptyOutDir: true, target: 'es2020',
    // Two pages: the site (/PAR/) and the plain player (/PAR/player/).
    rollupOptions: { input: { main: 'site/index.html', player: 'site/player/index.html' } },
  },
});
