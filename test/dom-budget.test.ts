import { afterEach, describe, expect, it } from 'vitest';

import { create } from '../src/index';
import { MAX_DOM_BUDGET, Scene } from '../src/core/Scene';
import { Overlay } from '../src/render/Overlay';
import { parseScript } from '../src/parser/ScriptParser';

const container = () => {
  const c = document.createElement('div');
  Object.defineProperty(c, 'clientWidth', { value: 640 });
  Object.defineProperty(c, 'clientHeight', { value: 360 });
  document.body.appendChild(c);
  return c;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('DOM budget safeguard and overload prevention', () => {
  it('defines safe MAX_DOM_BUDGET as 256', () => {
    expect(MAX_DOM_BUDGET).toBe(256);
  });

  it('caps DOM line elements at MAX_DOM_BUDGET and prioritizes dialogue over drawing / strip clips', () => {
    const box = container();
    const totalLines = 350;
    const events: string[] = [];

    // Add 2 dialogue lines with actual text
    events.push('Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Dialogue Line 1');
    events.push('Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Dialogue Line 2');

    // Add 348 contiguous 1px strip clip lines (dense signboard typesetting)
    for (let i = 2; i < totalLines; i++) {
      events.push(`Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\clip(${i},0,${i + 1},100)}Signboard`);
    }

    const script = [
      '[Script Info]', 'PlayResX: 640', 'PlayResY: 360', '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      'Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1', '',
      '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      ...events,
    ].join('\n');

    const par = create({ container: box, subtitle: script, renderMode: 'dom' });
    par.renderAt(1);

    const domLines = box.querySelectorAll('.par-line');
    // Active DOM lines must not exceed budget: 348 dense strips coalesce into 1 line, plus 2 dialogue lines = 3 DOM lines
    expect(domLines.length).toBeLessThanOrEqual(MAX_DOM_BUDGET);
    expect(domLines.length).toBe(3);

    // Dialogue text must be present and prioritized
    const textContent = Array.from(domLines).map((l) => l.textContent ?? '').join(' ');
    expect(textContent).toContain('Dialogue Line 1');
    expect(textContent).toContain('Dialogue Line 2');
    expect(textContent).toContain('Signboard');

    // Verify stats
    const metrics = par.getMetrics();
    expect(metrics.render.domLines).toBe(3);
    expect(metrics.activeLines).toBe(3);

    par.destroy();
  });

  it('cleans up views when lines drop below or past the budget', () => {
    const overlay = new Overlay(container(), 1);
    const scene = new Scene(overlay, () => 'dom', 1 << 20, () => 0, () => 'off', 5);
    expect(scene.domBudget).toBe(5);

    const script = parseScript([
      '[Script Info]', 'PlayResX: 640', 'PlayResY: 360', '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      'Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1', '',
      '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\clip(0,0,1,10)}Strip',
      'Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\clip(1,0,2,10)}Strip',
      'Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\clip(2,0,3,10)}Strip',
      'Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\clip(3,0,4,10)}Strip',
      'Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\clip(4,0,5,10)}Strip',
      'Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\clip(5,0,6,10)}Strip',
      'Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\clip(6,0,7,10)}Strip',
      'Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Text line that should have priority',
    ].join('\n'));

    scene.setScript(script);
    const env = {
      layout: { width: 640, height: 360, x: 0, y: 0, scale: 1, devScale: 1 },
      styles: script.styles,
      borderScale: 1,
      devScale: 1,
      fonts: {
        resolve: () => ({ family: 'Arial', metrics: null, bold: false, italic: false, loaded: true, synthetic: false }),
      },
    } as any;

    scene.render(1000, env, false);
    // 7 strip lines coalesce into 1, plus 1 text line = 2 active lines
    expect(scene.activeCount).toBe(2);
    expect(scene.activeCount).toBeLessThanOrEqual(scene.domBudget);

    // Ensure the text line is among the active views
    const hasTextLine = Array.from(overlay.root.querySelectorAll('.par-line'))
      .some((el) => (el.textContent ?? '').includes('Text line that should have priority'));
    expect(hasTextLine).toBe(true);

    // At frame t=6000, all lines ended, should clean up to 0
    scene.render(6000, env, false);
    expect(scene.activeCount).toBe(0);
    expect(overlay.root.querySelectorAll('.par-line').length).toBe(0);

    scene.dispose();
  });

  it('window feed fast boundary checks and immediate read range', () => {
    // Quick seek read range is [100ms back, 300ms ahead]
    const box = container();
    const calls: Array<{ t0: number; t1: number }> = [];
    const source = {
      kind: 'fake',
      script: { info: { playResX: 640, playResY: 360 } as any, styles: new Map(), warnings: [] },
      duration: 100,
      eventCount: 10,
      readWindow: (t0: number, t1: number) => {
        calls.push({ t0, t1 });
        return Promise.resolve([]);
      },
    };
    const par = create({ container: box, subtitle: source as any });
    par.renderAt(15.0);
    expect(calls.length).toBeGreaterThan(0);
    // 15.0 - 0.1 = 14.9, 15.0 + 0.3 = 15.3
    expect(calls[0].t0).toBeCloseTo(14.9, 2);
    expect(calls[0].t1).toBeCloseTo(15.3, 2);
    par.destroy();
  });

  it('coalesces contiguous vector clip strips (\\clip(m ...)) into unified DOM elements', () => {
    const box = container();
    const totalLines = 200;
    const events: string[] = [];

    // Add 1 dialogue line
    events.push('Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Main Dialogue');

    // Add 199 contiguous vector clip strip lines
    for (let i = 1; i < totalLines; i++) {
      events.push(`Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\clip(m ${i} 0 l ${i + 1} 0 l ${i + 1} 100 l ${i} 100)}VectorSign`);
    }

    const script = [
      '[Script Info]', 'PlayResX: 640', 'PlayResY: 360', '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      'Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1', '',
      '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      ...events,
    ].join('\n');

    const par = create({ container: box, subtitle: script, renderMode: 'dom' });
    par.renderAt(1);

    const domLines = box.querySelectorAll('.par-line');
    // 199 vector clip strips coalesce into 1 line, plus 1 dialogue line = 2 lines
    expect(domLines.length).toBe(2);

    const textContent = Array.from(domLines).map((l) => l.textContent ?? '').join(' ');
    expect(textContent).toContain('Main Dialogue');
    expect(textContent).toContain('VectorSign');

    par.destroy();
  });
});
