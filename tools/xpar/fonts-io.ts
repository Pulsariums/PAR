import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const FONT = /\.(ttf|otf|ttc|otc|woff2?)$/i;

/** Every `--font <file|dir>` of the command line, read whole (a directory contributes its font files). */
export const loadFonts = (a: string[]): Array<{ name: string; data: Uint8Array }> => {
  const out: Array<{ name: string; data: Uint8Array }> = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== '--font') continue;
    const p = a[i + 1];
    if (!p || !existsSync(p)) throw new Error(`--font: not found: ${p ?? '(missing)'}`);
    const files = statSync(p).isDirectory() ? readdirSync(p).filter((n) => FONT.test(n)).sort().map((n) => join(p, n)) : [p];
    for (const f of files) out.push({ name: basename(f), data: new Uint8Array(readFileSync(f)) });
  }
  return out;
};

export const saveFont = (dir: string, name: string, data: Uint8Array): string => {
  const to = join(dir, basename(name));
  writeFileSync(to, data);
  return to;
};
