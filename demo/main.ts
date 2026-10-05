import { create, type FpsOption, type LayoutOption, type RegionOption } from '../src/index';

import { SAMPLE_ASS } from './sample';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const player = $<HTMLDivElement>('player');
const video = $<HTMLVideoElement>('video');
const regionSel = $<HTMLSelectElement>('region');
const rectInput = $<HTMLInputElement>('rect');
const layoutSel = $<HTMLSelectElement>('layout');
const fpsSel = $<HTMLSelectElement>('fps');
const videoFpsInput = $<HTMLInputElement>('videoFps');
const offsetInput = $<HTMLInputElement>('offset');
const fitSel = $<HTMLSelectElement>('fit');
const playBtn = $<HTMLButtonElement>('play');
const seek = $<HTMLInputElement>('seek');
const clockLabel = $<HTMLSpanElement>('clockLabel');
const metrics = $<HTMLPreElement>('metrics');
const clockbar = $<HTMLDivElement>('clockbar');

/** Virtual clock used while no video is loaded. */
const virtual = { playing: false, base: 0, t0: 0 };
const virtualNow = () => (virtual.playing ? virtual.base + (performance.now() - virtual.t0) / 1000 : virtual.base);
const setVirtual = (t: number, playing: boolean) => {
  virtual.base = t;
  virtual.t0 = performance.now();
  virtual.playing = playing;
  playBtn.textContent = playing ? 'Pause' : 'Play';
};

let hasVideo = false;
player.classList.add('empty');

const readRegion = (): RegionOption => {
  rectInput.parentElement!.classList.toggle('off', regionSel.value !== 'custom');
  if (regionSel.value !== 'custom') return hasVideo ? (regionSel.value as RegionOption) : 'container';
  const [x, y, width, height] = rectInput.value.split(',').map(Number);
  return width > 0 && height > 0 ? { x, y, width, height } : 'container';
};
const readLayout = (): LayoutOption => {
  const m = /^(\d+)x(\d+)$/.exec(layoutSel.value);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : 'script';
};
const readFps = (): FpsOption => (fpsSel.value === 'auto' ? 'auto' : Number(fpsSel.value));
const readVideoFps = (): number | null => {
  const v = Number(videoFpsInput.value);
  return v > 0 ? v : null;
};

const par = create({
  container: player,
  clock: virtualNow,
  subtitle: SAMPLE_ASS,
  region: readRegion(),
  layout: readLayout(),
  fps: readFps(),
});

const applyOptions = () => {
  video.style.objectFit = fitSel.value;
  par.setOptions({
    region: readRegion(),
    layout: readLayout(),
    fps: readFps(),
    videoFps: readVideoFps(),
    timeOffset: Number(offsetInput.value) || 0,
  });
};
for (const el of [regionSel, rectInput, layoutSel, fpsSel, videoFpsInput, offsetInput, fitSel]) {
  el.addEventListener('change', applyOptions);
}

$<HTMLInputElement>('videoFile').addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (video.src) URL.revokeObjectURL(video.src);
  video.src = URL.createObjectURL(file);
  hasVideo = true;
  player.classList.remove('empty');
  clockbar.classList.add('off');
  setVirtual(0, false);
  par.setOptions({ video, clock: null, region: readRegion() });
});

$<HTMLInputElement>('assFile').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  par.setSubtitle(await file.text());
  const last = par.script?.events.reduce((m, ev) => Math.max(m, ev.end), 0) ?? 30;
  seek.max = String(Math.ceil(last));
});

playBtn.addEventListener('click', () => setVirtual(virtualNow(), !virtual.playing));
seek.addEventListener('input', () => setVirtual(Number(seek.value), virtual.playing));

const tick = () => {
  if (!hasVideo) {
    let t = virtualNow();
    if (t > Number(seek.max)) {
      setVirtual(0, virtual.playing);
      t = 0;
    }
    seek.value = String(t);
    clockLabel.textContent = `${t.toFixed(2)} s`;
  }
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

setInterval(() => {
  const m = par.getMetrics();
  const s = par.script;
  const r = (n: number) => Math.round(n * 100) / 100;
  metrics.textContent = [
    `time ${r(m.time)} s | active lines ${m.activeLines} | loop ${m.running ? 'running' : 'idle'}`,
    `region x=${r(m.region.x)} y=${r(m.region.y)} ${r(m.region.width)}x${r(m.region.height)} px | layout ${m.layout.width}x${m.layout.height} | scale ${r(m.scaleX)} x ${r(m.scaleY)}`,
    s ? `script PlayRes ${s.info.playResX}x${s.info.playResY}${s.info.playResFallback ? ' (fallback)' : ''} | styles ${s.styles.size} | events ${s.events.length} | warnings ${s.warnings.length}` : 'no script',
    ...(s?.warnings.slice(0, 5) ?? []),
  ].join('\n');
}, 250);
