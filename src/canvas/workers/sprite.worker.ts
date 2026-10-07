import { ByteLru } from '../../util/ByteLru';
import { construct } from '../construct';
import { canvasSupported, type Sprite } from '../raster';

import { attachSpriteHost, type HostScope } from './host';

const scope = self as unknown as HostScope & { fonts: { add(f: unknown): void; delete(f: unknown): void } };
const faces = new Map<string, unknown>();
/** Finished white masks of this worker (a mask is shared by every colour of a shape); freed when evicted. */
const masks = new ByteLru<string, Sprite | null>(24 << 20, (_k, s) => { if (s) (s.canvas as OffscreenCanvas).width = 0; });

attachSpriteHost(scope, {
  supported: () => typeof OffscreenCanvas !== 'undefined' && typeof FontFace !== 'undefined' && !!scope.fonts && canvasSupported(),
  build: (spec) => {
    const s = construct(spec, {
      peek: (k) => masks.get(k),
      store: (k, build) => { const m = build(); masks.set(k, m, m ? m.bytes : 16); },
    });
    if (!s) return null;
    const bitmap = (s.canvas as OffscreenCanvas).transferToImageBitmap();
    return { bitmap, w: s.w, h: s.h, boxW: s.boxW, ox: s.ox, oy: s.oy, bytes: s.bytes };
  },
  addFace: async (f) => {
    const face = new FontFace(f.family, f.data, { weight: String(f.weight), style: f.italic ? 'italic' : 'normal', display: 'block' });
    await face.load();
    scope.fonts.add(face);
    faces.set(f.key, face);
  },
  removeFace: (key) => { const f = faces.get(key); if (f) { scope.fonts.delete(f); faces.delete(key); } },
});
