import { createWriteStream, mkdirSync } from 'node:fs';
import { once } from 'node:events';

import { PROFILES, profileById } from './bench-all';

/** `gen-bench [--out dir] [--seconds N] [--seed N] [profile...]` writes <dir>/<profile>.ass (streaming). */
const argv = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = argv.indexOf(name);
  return i === -1 ? def : argv.splice(i, 2)[1];
};
const out = opt('--out', 'bench-data');
const seconds = Number(opt('--seconds', '0'));
const seed = Number(opt('--seed', '1'));
const ids = argv.length ? argv : PROFILES.map((p) => p.id);
mkdirSync(out, { recursive: true });
for (const id of ids) {
  const p = profileById(id);
  if (!p) throw new Error(`unknown profile ${id}; known: ${PROFILES.map((x) => x.id).join(', ')}`);
  const path = `${out}/${id}.ass`;
  const ws = createWriteStream(path);
  let bytes = 0;
  for (const piece of p.generate(seconds || p.seconds, seed)) {
    bytes += piece.length;
    if (!ws.write(piece)) await once(ws, 'drain');
  }
  ws.end();
  await once(ws, 'finish');
  console.log(`${path}  ${(bytes / 1048576).toFixed(1)} MB (chars)`);
}
