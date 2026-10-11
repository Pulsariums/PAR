import { describe, expect, it } from 'vitest';

import { runForensicAnalysis } from '../site/src/studio/optimize/forensic';

describe('Forensic optimization engine', () => {
  const sampleAss = `[Script Info]
Title: Forensic Sample
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,50,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,3,0,2,30,30,30,1
Style: ED - Hun,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,30,30,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,ED - Hun,,0,0,0,,{\\blur60\\t(0,350,\\blur6)}Animasyonlu blur alt satırı...
Dialogue: 1,0:00:01.00,0:00:04.00,ED - Hun,,0,0,0,,{\\blur30\\t(0,350,\\blur2)}İkinci katman blur alt satırı...
Dialogue: 0,0:00:04.00,0:00:08.00,Default,,0,0,0,,{\\pos(960,1000)}Yeni başlayan konumlu satır
Dialogue: 0,0:00:08.00,0:00:12.00,Default,,0,0,0,,Unpositioned alt satır (forced reflow adayı)
`;

  it('correctly analyzes script architecture and detects DOM routing', () => {
    const res = runForensicAnalysis({
      text: sampleAss,
      startSec: 0,
      endSec: 10,
      fps: 24,
    });

    expect(res.summary.totalEvents).toBe(4);
    expect(res.summary.domLinesCount).toBe(4); // All lines have whitespace/long/stacking
    expect(res.summary.blurLinesCount).toBe(2);
    expect(res.summary.unpositionedLinesCount).toBe(1);
    expect(res.summary.analyzedFrames).toBeGreaterThan(100);
  });

  it('measures execution waterfall sequence per frame', () => {
    const res = runForensicAnalysis({
      text: sampleAss,
      startSec: 1.0,
      endSec: 3.0,
      fps: 24,
    });

    expect(res.frames.length).toBeGreaterThan(0);
    const firstFrame = res.frames[0];
    expect(firstFrame.steps.length).toBe(6);
    expect(firstFrame.steps.map((s) => s.category)).toEqual([
      'timeline',
      'eval',
      'dom',
      'layout',
      'filter',
      'composite',
    ]);
  });

  it('detects line transitions and collects before, at, after forensic metrics', () => {
    const res = runForensicAnalysis({
      text: sampleAss,
      startSec: 0.5,
      endSec: 9.0,
      fps: 24,
    });

    expect(res.transitions.length).toBeGreaterThanOrEqual(2);
    const trans = res.transitions[0];
    expect(trans.before).toBeDefined();
    expect(trans.at).toBeDefined();
    expect(trans.after).toBeDefined();
    expect(trans.at.estimatedCostMs).toBeGreaterThan(0);
  });

  it('demonstrates PAR blur quantization savings', () => {
    const res = runForensicAnalysis({
      text: sampleAss,
      startSec: 1.0,
      endSec: 3.0,
      fps: 24,
    });

    expect(res.optimizationsGain.svgBlurSavedPercent).toBeGreaterThan(0);
    expect(res.optimizationsGain.svgBlurSavedMutations).toBeGreaterThan(0);
  });
});
