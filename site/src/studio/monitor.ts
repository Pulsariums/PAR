import { t } from '../i18n/i18n';
import type { Player } from '../player/player';

/** Samples kept per graph (~40 s at 6 Hz). */
const WINDOW = 240;
/** One graph sample every this many ms. */
const SAMPLE_MS = 170;
/** Long tasks are a coarse main-thread-load signal (entryTypes: longtask). */
const LT_LOOKBACK_MS = 1000;

/** Compact label keys of the five live graphs (translation happens through data-i18n). */
export const MONITOR_HTML = `
<div class="st-mon">
  <h3 data-i18n="st.mon"></h3>
  <p class="hint mono st-mon-num" id="stMonNum">—</p>
  <div class="st-spark" data-label="fps"><span data-i18n="st.monFps"></span><canvas></canvas><b class="mono">—</b></div>
  <div class="st-spark" data-label="lag"><span data-i18n="st.monLag"></span><canvas></canvas><b class="mono">—</b></div>
  <div class="st-spark" data-label="cpu"><span data-i18n="st.monCpu"></span><canvas></canvas><b class="mono">—</b></div>
  <div class="st-spark" data-label="ready"><span data-i18n="st.monReady"></span><canvas></canvas><b class="mono">—</b></div>
  <div class="st-spark" data-label="lines"><span data-i18n="st.monLines"></span><canvas></canvas><b class="mono">—</b></div>
  <p class="hint" data-i18n="st.monHint"></p>
</div>`;

class Spark {
  private readonly data: number[] = [];
  private readonly canvas: HTMLCanvasElement;
  private readonly value: HTMLElement;
  constructor(row: HTMLElement, private readonly fmt: (v: number) => string) {
    this.canvas = row.querySelector('canvas')!;
    this.value = row.querySelector('b')!;
  }
  push(v: number): void {
    this.data.push(v);
    if (this.data.length > WINDOW) this.data.shift();
    this.value.textContent = this.fmt(v);
    this.draw();
  }
  private draw(): void {
    const c = this.canvas;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const w = Math.max(64, Math.round(c.clientWidth * dpr)), h = Math.round(34 * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const n = this.data.length;
    if (n < 2) return;
    let max = 0;
    for (const v of this.data) if (v > max) max = v;
    if (max <= 0) max = 1;
    ctx.strokeStyle = getComputedStyle(c).color;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (i / (WINDOW - 1)) * w;
      const y = h - 1 - (this.data[i] / max) * (h - 2);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
}

const fmt0 = (v: number): string => String(Math.round(v));
const fmt1 = (v: number): string => v.toFixed(1);

/** Live side monitor: rolling graphs of fps, frame latency, long-task load, prepared-ahead seconds and active lines. */
export const initMonitor = (player: Player, host: HTMLElement): { tick(): void } => {
  host.innerHTML = MONITOR_HTML;
  const rows = host.querySelectorAll<HTMLElement>('.st-spark');
  const by = (label: string): HTMLElement => [...rows].find((r) => r.dataset.label === label)!;
  const fps = new Spark(by('fps'), fmt0);
  const lag = new Spark(by('lag'), fmt0);
  const cpu = new Spark(by('cpu'), fmt0);
  const ready = new Spark(by('ready'), fmt1);
  const lines = new Spark(by('lines'), fmt0);
  const num = host.querySelector<HTMLElement>('#stMonNum')!;
  let last = performance.now();
  let pendingFrames = 0, pendingMs = 0, pendingMaxGap = 0;
  const lt: number[] = [];
  try {
    new PerformanceObserver((list) => {
      const now = performance.now();
      for (const e of list.getEntries()) lt.push(now, e.duration);
      while (lt.length && now - lt[0] > LT_LOOKBACK_MS + 200) lt.splice(0, 2);
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* unsupported: the cpu graph stays flat */ }
  const tick = (): void => {
    const now = performance.now();
    const gap = now - last;
    last = now;
    if (gap > 0 && gap < 2000) { pendingFrames++; pendingMs += gap; if (gap > pendingMaxGap) pendingMaxGap = gap; }
    if (pendingMs < SAMPLE_MS) return;
    const fAvg = pendingMs / Math.max(1, pendingFrames);
    const cpuNow = now;
    while (lt.length && cpuNow - lt[0] > LT_LOOKBACK_MS) lt.splice(0, 2);
    let ltMs = 0;
    for (let i = 1; i < lt.length; i += 2) ltMs += lt[i]!;
    fps.push(1000 / fAvg);
    lag.push(pendingMaxGap);
    cpu.push((ltMs / LT_LOOKBACK_MS) * 100);
    pendingFrames = 0; pendingMs = 0; pendingMaxGap = 0;
    const m = player.par.getMetrics();
    const r = m.render;
    const readyS = Math.min(r.readyMs, 3600 * 1000) / 1000;
    ready.push(readyS);
    lines.push(m.activeLines);
    num.textContent = t('st.monNum', {
      fps: fmt0(1000 / fAvg), lag: fmt0(r.frameMs.p95), cpu: fmt0((ltMs / LT_LOOKBACK_MS) * 100),
      ready: fmt1(readyS), plan: fmt1(r.planLeadMs / 1000), lines: String(m.activeLines),
      pend: String(r.pending + r.planQueued), work: String(r.workers),
    });
  };
  return { tick };
};
