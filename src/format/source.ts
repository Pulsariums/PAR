import { fail } from './errors';

/** Random-access byte source: a Uint8Array, a Blob/File, or an HTTP URL (Range requests). */
export interface ByteSource {
  size(): Promise<number>;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export const bytesSource = (b: Uint8Array): ByteSource => ({
  size: async () => b.length,
  read: async (o, l) => {
    if (o < 0 || l < 0 || o + l > b.length) fail('TRUNCATED', 'read past the end of the data');
    return b.subarray(o, o + l);
  },
});

export const blobSource = (b: Blob): ByteSource => ({
  size: async () => b.size,
  read: async (o, l) => {
    if (o < 0 || l < 0 || o + l > b.size) fail('TRUNCATED', 'read past the end of the data');
    return new Uint8Array(await b.slice(o, o + l).arrayBuffer());
  },
});

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

/** HTTP source: needs a server that honours `Range` (206). Total size comes from `Content-Range` of a suffix request. */
export const urlSource = (url: string, fetchImpl: FetchLike = (u, i) => fetch(u, i)): ByteSource => {
  let total: number | null = null;
  const range = async (spec: string): Promise<Response> => {
    const res = await fetchImpl(url, { headers: { Range: `bytes=${spec}` } });
    if (res.status !== 206) fail('IO', `server did not answer the Range request (HTTP ${res.status})`);
    return res;
  };
  return {
    async size() {
      if (total === null) {
        const res = await range('-1');
        const m = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '');
        if (!m) fail('IO', 'missing Content-Range');
        total = Number(m![1]);
        await res.arrayBuffer();
      }
      return total;
    },
    async read(o, l) {
      if (l === 0) return new Uint8Array(0);
      const res = await range(`${o}-${o + l - 1}`);
      const out = new Uint8Array(await res.arrayBuffer());
      if (out.length !== l) fail('TRUNCATED', 'short Range response');
      return out;
    },
  };
};

export type XparSource = Blob | Uint8Array | string | ByteSource;

export const toSource = (s: XparSource): ByteSource => {
  if (typeof s === 'string') return urlSource(s);
  if (s instanceof Uint8Array) return bytesSource(s);
  if (typeof Blob !== 'undefined' && s instanceof Blob) return blobSource(s);
  return s as ByteSource;
};
