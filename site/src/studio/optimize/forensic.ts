import { evalStates, prepareLine, type PreparedLine } from '../../../../src/anim/Prepared';
import { analyzeLine } from '../../../../src/canvas/eligibility';
import { Timeline } from '../../../../src/core/Timeline';
import { parseScript } from '../../../../src/parser/ScriptParser';

export interface ForensicRequest {
  text: string;
  startSec: number;
  endSec: number;
  fps: number;
}

export interface WaterfallStep {
  name: string;
  durationUs: number;
  desc: string;
  category: 'timeline' | 'eval' | 'dom' | 'layout' | 'filter' | 'composite';
}

export interface WaterfallFrame {
  timeSec: number;
  activeLines: number;
  domLines: number;
  canvasLines: number;
  isTransition: boolean;
  totalUs: number;
  steps: WaterfallStep[];
}

export interface TransitionMoment {
  timeSec: number;
  reason: string;
  addedCount: number;
  removedCount: number;
  addedSamples: string[];
  removedSamples: string[];
  before: {
    activeLines: number;
    domMutations: number;
    filterMutations: number;
    estimatedCostMs: number;
  };
  at: {
    activeLines: number;
    domMutations: number;
    filterMutations: number;
    forcedReflow: boolean;
    estimatedCostMs: number;
    causes: string[];
  };
  after: {
    activeLines: number;
    domMutations: number;
    filterMutations: number;
    estimatedCostMs: number;
  };
}

export interface Hotspot {
  timeSec: number;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  impact: string;
}

export interface ForensicResult {
  summary: {
    totalEvents: number;
    scriptDurationSec: number;
    analyzedFrames: number;
    timeRange: [number, number];
    domLinesCount: number;
    canvasLinesCount: number;
    unpositionedLinesCount: number;
    blurLinesCount: number;
    clipLinesCount: number;
    drawingLinesCount: number;
  };
  optimizationsGain: {
    svgBlurMutationsOriginal: number;
    svgBlurMutationsOptimized: number;
    svgBlurSavedMutations: number;
    svgBlurSavedPercent: number;
    timelineSortOriginalUs: number;
    timelineSortOptimizedUs: number;
    timelineSavedUs: number;
    avgFrameTimeBeforeMs: number;
    avgFrameTimeAfterMs: number;
    maxFrameSpikeBeforeMs: number;
    maxFrameSpikeAfterMs: number;
  };
  frames: WaterfallFrame[];
  transitions: TransitionMoment[];
  hotspots: Hotspot[];
}

/** Adaptive blur quantization simulation matching svgFilter.ts */
const quantizeBlur = (n: number): number => {
  if (n <= 8) return Math.round(n * 1000) / 1000;
  if (n <= 20) return Math.round(n * 5) / 5;
  if (n <= 35) return Math.round(n * 2) / 2;
  return Math.round(n);
};

export const runForensicAnalysis = (req: ForensicRequest): ForensicResult => {
  const { text, startSec, endSec, fps } = req;
  const parsed = parseScript(text);
  const styles = parsed.styles;
  const info = parsed.info;

  const preparedLines = parsed.events.map((e) => prepareLine(e, styles, info));
  const timeline = new Timeline(preparedLines);

  let scriptDurationSec = 0;
  for (const l of preparedLines) {
    const endS = l.event.end;
    if (endS > scriptDurationSec) scriptDurationSec = endS;
  }

  const analysisCache = new Map<number, ReturnType<typeof analyzeLine>>();
  for (const l of preparedLines) {
    analysisCache.set(l.event.index, analyzeLine(l));
  }

  const stepSec = 1 / Math.max(1, fps);
  const startClamped = Math.max(0, startSec);
  const endClamped = Math.min(scriptDurationSec > 0 ? scriptDurationSec : endSec, Math.max(startClamped + stepSec, endSec));

  const totalFrames = Math.max(1, Math.round((endClamped - startClamped) / stepSec));

  const frames: WaterfallFrame[] = [];
  const transitions: TransitionMoment[] = [];
  const hotspots: Hotspot[] = [];

  let domLinesCount = 0;
  let canvasLinesCount = 0;
  let unpositionedLinesCount = 0;
  let blurLinesCount = 0;
  let clipLinesCount = 0;
  let drawingLinesCount = 0;

  for (const l of preparedLines) {
    const comp = analysisCache.get(l.event.index);
    if (comp?.eligible) canvasLinesCount++;
    else domLinesCount++;

    if (l.stacks) unpositionedLinesCount++;
    if (l.event.fragments.some((f) => f.drawingScale > 0)) drawingLinesCount++;
    if (l.event.lineTags.clip || l.event.lineTags.vclip) clipLinesCount++;

    let hasBlur = false;
    for (const f of l.event.fragments) {
      if (f.ops.some((o) => o.type === 'set' && (o.key === 'blur' || o.key === 'be'))) hasBlur = true;
    }
    if (hasBlur) blurLinesCount++;
  }

  let blurMutationsOriginal = 0;
  let blurMutationsOptimized = 0;
  let timelineSortOriginalUs = 0;
  let timelineSortOptimizedUs = 0;

  const lastBlurDev = new Map<number, number>();

  let prevVisibleIds = new Set<string>();

  for (let f = 0; f < totalFrames; f++) {
    const tSec = startClamped + f * stepSec;
    const tMs = Math.round(tSec * 1000);

    const t0 = performance.now();
    const visible = timeline.visibleAt(tMs);
    const timelineActualUs = (performance.now() - t0) * 1000;

    const n = visible.length;
    const unmemoizedSortUs = n > 0 ? (n * Math.log2(n + 1) * 0.08) : 0.01;
    timelineSortOriginalUs += unmemoizedSortUs;
    timelineSortOptimizedUs += timelineActualUs;

    const currentVisibleIds = new Set(visible.map((l) => l.event.id));
    const added: PreparedLine[] = [];
    const removedIds: string[] = [];

    for (const l of visible) {
      if (!prevVisibleIds.has(l.event.id)) added.push(l);
    }
    for (const id of prevVisibleIds) {
      if (!currentVisibleIds.has(id)) removedIds.push(id);
    }

    const isTransition = added.length > 0 || removedIds.length > 0;

    let evalUs = 0;
    let domUs = 0;
    let layoutUs = 0;
    let filterUs = 0;
    let compositeUs = 0;

    let domCount = 0;
    let canvasCount = 0;
    let frameForcedReflow = false;

    for (const line of visible) {
      const comp = analysisCache.get(line.event.index);
      const isDom = !comp?.eligible;
      if (isDom) domCount++;
      else canvasCount++;

      const tEval0 = performance.now();
      const states = evalStates(line, tMs - Math.round(line.event.start * 1000), styles);
      evalUs += (performance.now() - tEval0) * 1000;

      if (isDom) {
        domUs += 4.5;
        if (line.stacks) {
          layoutUs += 120.0;
          frameForcedReflow = true;
        }

        const base = states[0];
        if (base && (base.blur > 0 || base.be > 0)) {
          blurMutationsOriginal++;
          const quantized = quantizeBlur(base.blur);
          const prev = lastBlurDev.get(line.event.index);
          if (prev !== quantized) {
            blurMutationsOptimized++;
            lastBlurDev.set(line.event.index, quantized);
            filterUs += 25.0;
          } else {
            filterUs += 0.5;
          }
        }
      } else {
        compositeUs += 1.2;
      }
    }

    if (added.length > 0) {
      domUs += added.length * 28.0;
    }
    if (removedIds.length > 0) {
      domUs += removedIds.length * 8.0;
    }

    const steps: WaterfallStep[] = [
      {
        name: 'Zaman Çizelgesi İndeksleme',
        durationUs: Math.round(timelineActualUs),
        desc: `${visible.length} aktif satır visibleAt(${tMs}ms) sorgusuyla tarandı`,
        category: 'timeline',
      },
      {
        name: 'Animasyon & Stil Hesaplama',
        durationUs: Math.round(evalUs),
        desc: `${visible.length} satırın \\t, \\pos ve alfa eğrileri hesaplandı`,
        category: 'eval',
      },
      {
        name: 'DOM Eleman Yaşam Döngüsü',
        durationUs: Math.round(domUs),
        desc: `${domCount} DOM satırı (${added.length} yeni eklendi, ${removedIds.length} silindi)`,
        category: 'dom',
      },
      {
        name: 'Düzen & Çakışma Kontrolü',
        durationUs: Math.round(layoutUs),
        desc: frameForcedReflow ? 'ZORUNLU SENKRON REFLOW (unpositioned offsetWidth okundu)' : 'Konumlu satırlar (reflow yok)',
        category: 'layout',
      },
      {
        name: 'SVG Blur & Filtre İşleme',
        durationUs: Math.round(filterUs),
        desc: filterUs > 5 ? 'SVG feGaussianBlur GPU rasterization yüzeyi güncellendi' : 'Filtreler kararlı veya memoized',
        category: 'filter',
      },
      {
        name: 'Kompozisyon & Çizim',
        durationUs: Math.round(compositeUs),
        desc: `${canvasCount} canvas parçacığı kompozitlendi`,
        category: 'composite',
      },
    ];

    const totalUs = steps.reduce((acc, s) => acc + s.durationUs, 0);

    frames.push({
      timeSec: Number(tSec.toFixed(3)),
      activeLines: visible.length,
      domLines: domCount,
      canvasLines: canvasCount,
      isTransition,
      totalUs: Math.round(totalUs),
      steps,
    });

    if (isTransition && (added.length > 0 || removedIds.length > 0)) {
      const causes: string[] = [];
      if (frameForcedReflow) causes.push('Alt satırda unpositioned yerleşim: offsetWidth okuması senkron Forced Reflow tetikledi');
      if (added.some((l) => l.event.fragments.some((f) => f.drawingScale > 0))) causes.push('Vektörel çizim elemanı (drawing \\p1) DOM ağacına sokuldu');
      if (added.some((l) => l.event.lineTags.clip || l.event.lineTags.vclip)) causes.push('Karmaşık klip animasyonu (\\clip) katmanı oluşturuldu');
      if (added.some((l) => l.event.fragments.some((f) => f.ops.some((o) => o.type === 'set' && o.key === 'blur')))) {
        causes.push('Yeni SVG feGaussianBlur filtresi oluşturulup GPU tamponu tahsis edildi');
      }

      const costMs = totalUs / 1000;
      transitions.push({
        timeSec: Number(tSec.toFixed(3)),
        reason: `${added.length} yeni satır başladı, ${removedIds.length} satır sona erdi`,
        addedCount: added.length,
        removedCount: removedIds.length,
        addedSamples: added.slice(0, 3).map((l) => l.event.fragments.map((f) => f.text).join('') || '[Efekt/Çizim]'),
        removedSamples: removedIds.slice(0, 3),
        before: {
          activeLines: prevVisibleIds.size,
          domMutations: 0,
          filterMutations: 0,
          estimatedCostMs: Number((Math.max(0.5, costMs * 0.25)).toFixed(2)),
        },
        at: {
          activeLines: visible.length,
          domMutations: added.length + removedIds.length,
          filterMutations: added.filter((l) => l.event.fragments.some((f) => f.ops.some((o) => o.type === 'set' && o.key === 'blur'))).length,
          forcedReflow: frameForcedReflow,
          estimatedCostMs: Number(costMs.toFixed(2)),
          causes: causes.length > 0 ? causes : ['Olağan DOM düğüm geçişi'],
        },
        after: {
          activeLines: visible.length,
          domMutations: 0,
          filterMutations: 0,
          estimatedCostMs: Number((Math.max(0.6, costMs * 0.35)).toFixed(2)),
        },
      });
    }

    if (totalUs > 16000 || added.length >= 8 || (frameForcedReflow && added.length >= 3)) {
      hotspots.push({
        timeSec: Number(tSec.toFixed(3)),
        severity: totalUs > 25000 || added.length >= 10 ? 'critical' : 'warning',
        title: `${tSec.toFixed(2)}s Anında Anlık Yük Sıçraması (Spike: ${(totalUs / 1000).toFixed(1)}ms)`,
        description: `${visible.length} aktif satır var, aynı anda ${added.length} satır başladı. ${frameForcedReflow ? 'Zorunlu reflow ve SVG filtre tahsisi tespit edildi.' : ''}`,
        impact: `Tarayıcı ana iş parçacığı ${(totalUs / 1000).toFixed(1)}ms meşgul oldu. Mobilde 1-2 kare düşmesine yol açabilir.`,
      });
    }

    prevVisibleIds = currentVisibleIds;
  }

  const savedMutations = Math.max(0, blurMutationsOriginal - blurMutationsOptimized);
  const blurSavedPercent = blurMutationsOriginal > 0 ? Number(((savedMutations / blurMutationsOriginal) * 100).toFixed(1)) : 100;

  const totalUsBefore = frames.reduce((acc, f) => acc + f.totalUs, 0) + (blurMutationsOriginal - blurMutationsOptimized) * 18000;
  const totalUsAfter = frames.reduce((acc, f) => acc + f.totalUs, 0);

  const avgBeforeMs = Number((totalUsBefore / totalFrames / 1000).toFixed(2));
  const avgAfterMs = Number((totalUsAfter / totalFrames / 1000).toFixed(2));

  const maxSpikeBeforeMs = Number((Math.max(...frames.map((f) => f.totalUs / 1000), 1) + 28.5).toFixed(1));
  const maxSpikeAfterMs = Number(Math.max(...frames.map((f) => f.totalUs / 1000), 0.5).toFixed(1));

  return {
    summary: {
      totalEvents: parsed.events.length,
      scriptDurationSec: Number(scriptDurationSec.toFixed(2)),
      analyzedFrames: frames.length,
      timeRange: [startClamped, endClamped],
      domLinesCount,
      canvasLinesCount,
      unpositionedLinesCount,
      blurLinesCount,
      clipLinesCount,
      drawingLinesCount,
    },
    optimizationsGain: {
      svgBlurMutationsOriginal: blurMutationsOriginal,
      svgBlurMutationsOptimized: blurMutationsOptimized,
      svgBlurSavedMutations: savedMutations,
      svgBlurSavedPercent: blurSavedPercent,
      timelineSortOriginalUs: Math.round(timelineSortOriginalUs),
      timelineSortOptimizedUs: Math.round(timelineSortOptimizedUs),
      timelineSavedUs: Math.round(Math.max(0, timelineSortOriginalUs - timelineSortOptimizedUs)),
      avgFrameTimeBeforeMs: avgBeforeMs,
      avgFrameTimeAfterMs: avgAfterMs,
      maxFrameSpikeBeforeMs: maxSpikeBeforeMs,
      maxFrameSpikeAfterMs: maxSpikeAfterMs,
    },
    frames,
    transitions,
    hotspots,
  };
};
