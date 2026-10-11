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

    // Add 348 drawing lines or 1px strip clip lines (dense typesetting)
    for (let i = 2; i < totalLines; i++) {
      if (i % 2 === 0) {
        // Vector drawing line
        events.push(`Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\p1}m 0 0 l 10 10`);
      } else {
        // 1px strip clip line
        events.push(`Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\clip(${i},0,${i + 1},100)}m`);
      }
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
    // Active DOM lines must not exceed budget
    expect(domLines.length).toBeLessThanOrEqual(MAX_DOM_BUDGET);
    expect(domLines.length).toBe(MAX_DOM_BUDGET);

    // Dialogue text must be present and rendered
    const textContent = Array.from(domLines).map((l) => l.textContent ?? '').join(' ');
    expect(textContent).toContain('Dialogue Line 1');
    expect(textContent).toContain('Dialogue Line 2');

    // Verify stats
    const metrics = par.getMetrics();
    expect(metrics.render.domLines).toBe(MAX_DOM_BUDGET);
    expect(metrics.activeLines).toBe(MAX_DOM_BUDGET);

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
      'Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\p1}m 0 0 l 1 1',
      'Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\p1}m 0 0 l 2 2',
      'Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\p1}m 0 0 l 3 3',
      'Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\p1}m 0 0 l 4 4',
      'Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\p1}m 0 0 l 5 5',
      'Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\p1}m 0 0 l 6 6',
      'Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\p1}m 0 0 l 7 7',
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
    expect(scene.activeCount).toBe(5);

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
});
