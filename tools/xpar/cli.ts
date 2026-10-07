import { decode, encode, info, verify } from './cmd-xpar';

const USAGE = `xpar <command>
  xpar encode <in.ass> <out.xpar> [--codec deflate|rc|stored] [--chunk-bytes N]
  xpar decode <in.xpar|in.par> <out.ass>
  xpar info   <file.xpar|file.par>
  xpar verify <in.ass> [--codec ...]        encode + decode + SHA-256 compare
  par  bake   <in.ass> <out.par> --fps N    lossy render-baked format (see docs/formats/PAR.md)
  par  optimize <in.ass> <out.ass> --fps N [--mode exact|invisible|loose]   frame-by-frame runs -> \move / \t (docs/optimize.md)`;

const [cmd, ...rest] = process.argv.slice(2);
const table: Record<string, (a: string[]) => Promise<void>> = { encode, decode, info, verify };
try {
  if (cmd === 'optimize') {
    const { optimizeCmd } = await import('./cmd-optimize');
    await optimizeCmd(rest);
  } else if (cmd === 'bake' || cmd === 'par') {
    const { bakeCmd } = await import('./cmd-par');
    await bakeCmd(cmd === 'par' ? rest.slice(1) : rest);
  } else if (cmd && table[cmd]) await table[cmd](rest);
  else {
    console.error(USAGE);
    process.exitCode = 2;
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
