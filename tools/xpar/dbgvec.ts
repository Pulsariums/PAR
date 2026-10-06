import { VecCoder } from '../../src/format/vec';
import { StreamWriter } from '../../src/format/streams';
import { ByteReader } from '../../src/format/bytes';
const vc = new VecCoder(); const sw = new StreamWriter();
// 3 particles, linear motion in 2-dec scale, 40 frames
const N = 3; const out: number[] = [];
for (let f = 0; f < 6; f++) for (let p = 0; p < N; p++) {
  const nums = [{ m: 100000 + p * 5000 + f * (300 + p * 100), d: 2 }, { m: 50000 + p * 777 + f * 120, d: 2 }];
  vc.encode(1, nums, [1, 2], sw);
}
const r = new ByteReader(sw.bytesOf(8)); const refs: number[] = []; while (r.left) refs.push(r.uv());
const d = new ByteReader(sw.bytesOf(65)); const ds: number[] = []; while (d.left) ds.push(d.sv());
console.log('refs', refs.join(','), '\ndeltas x', ds.join(','));
void out;
