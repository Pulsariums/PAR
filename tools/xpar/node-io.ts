import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, openSync, readSync, closeSync, statSync, type WriteStream } from 'node:fs';
import { once } from 'node:events';

import type { ByteSource } from '../../src/format';

/** File as an async iterable of byte chunks (never the whole file in memory). */
export const readChunks = (path: string): AsyncIterable<Uint8Array> => createReadStream(path, { highWaterMark: 1 << 20 });

/** Random-access source over a file descriptor (used to open .xpar/.par without reading them whole). */
export const fileSource = (path: string): ByteSource => {
  const fd = openSync(path, 'r');
  const size = statSync(path).size;
  return {
    size: async () => size,
    read: async (o, l) => {
      const b = new Uint8Array(l);
      let got = 0;
      while (got < l) {
        const n = readSync(fd, b, got, l - got, o + got);
        if (n === 0) break;
        got += n;
      }
      return got === l ? b : b.subarray(0, got);
    },
  };
};

export const closeFd = (_s: ByteSource): void => undefined;
void closeSync;

export interface OutFile {
  write: (b: Uint8Array) => Promise<void>;
  end: () => Promise<void>;
  bytes: () => number;
}

export const openOut = (path: string): OutFile => {
  const ws: WriteStream = createWriteStream(path);
  let n = 0;
  return {
    write: async (b) => {
      n += b.length;
      if (!ws.write(b)) await once(ws, 'drain');
    },
    end: async () => {
      ws.end();
      await once(ws, 'finish');
    },
    bytes: () => n,
  };
};

export const sha256Of = async (it: AsyncIterable<Uint8Array>): Promise<string> => {
  const h = createHash('sha256');
  for await (const c of it) h.update(c);
  return h.digest('hex');
};

export const newHash = () => createHash('sha256');
export const fileSize = (p: string): number => statSync(p).size;
export const mb = (n: number): string => (n / 1048576).toFixed(2);
