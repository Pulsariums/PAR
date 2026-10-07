import { defineConfig, type Plugin } from 'vite';

const FILES: Record<string, string> = { es: 'par.js', cjs: 'par.cjs', iife: 'par.global.js' };

/**
 * The sprite worker is inlined into the bundle (`?worker&inline`: a blob URL, data: URL fallback), so there is no worker file to host and
 * nothing for the consumer's bundler to resolve. Vite still emits the worker's own sourcemap as `dist/assets/sprite.worker-*.js.map` and
 * leaves a `sourceMappingURL` comment in the inlined code; a blob can never load that file, so the map is dead weight in the package.
 */
const dropWorkerMap = (): Plugin => ({
  name: 'par:drop-inline-worker-map',
  enforce: 'post',
  transform(code, id) {
    if (!id.includes('?worker&inline')) return null;
    return { code: code.replace(/(?:\\n|\n)\/\/# sourceMappingURL=[^"'\\\n]*\.map/g, ''), map: null };
  },
  generateBundle(_o, bundle) {
    for (const k of Object.keys(bundle)) if (/^assets\/.*\.js\.map$/.test(k)) delete bundle[k];
  },
});

export default defineConfig({
  plugins: [dropWorkerMap()],
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
