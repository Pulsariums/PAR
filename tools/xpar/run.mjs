// Bundles a tools/xpar/*.ts entry with rolldown (no new dependencies) and runs it with Node.
//   node tools/xpar/run.mjs <entry-without-.ts> [args...]
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [entry, ...rest] = process.argv.slice(2);
if (!entry) {
  console.error('usage: node tools/xpar/run.mjs <cli|gen-bench|bench|verify-par> [args...]');
  process.exit(2);
}
const outDir = resolve(root, 'dist/xpar-tools');
mkdirSync(outDir, { recursive: true });
const { build } = await import(resolve(root, 'node_modules/rolldown/dist/index.mjs'));
await build({
  input: resolve(root, `tools/xpar/${entry}.ts`),
  output: { dir: outDir, entryFileNames: `${entry}.mjs`, format: 'esm' },
  platform: 'node',
  logLevel: 'silent',
});
const r = spawnSync(process.execPath, ['--max-old-space-size=4096', '--expose-gc', resolve(outDir, `${entry}.mjs`), ...rest], { stdio: 'inherit', cwd: process.cwd() });
process.exit(r.status ?? 1);
