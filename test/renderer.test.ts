import { afterEach, describe, expect, it } from 'vitest';

import { create } from '../src/index';
import { snapToFrame } from '../src/core/options';

import { SAMPLE } from './fixtures';

const lines = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('.par-line'));
const text = (el: HTMLElement) => Array.from(el.querySelectorAll('.par-frag')).map((s) => s.firstChild?.textContent ?? '').join('');

const makeContainer = (w = 960, h = 540) => {
  const c = document.createElement('div');
  Object.defineProperty(c, 'clientWidth', { value: w });
  Object.defineProperty(c, 'clientHeight', { value: h });
  document.body.appendChild(c);
  return c;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('renderer (DOM)', () => {
  it('works without a video: container + manual renderAt', () => {
    const container = makeContainer();
    const par = create({ container, subtitle: SAMPLE });
    par.renderAt(0.5);
    expect(lines(par.element)).toHaveLength(0);
    par.renderAt(2.6);
    const shown = lines(par.element);
    expect(shown.map((l) => l.dataset.parId)).toEqual(['0', '1']);
    expect(text(shown[0])).toBe('Hello, world!');
    expect(text(shown[1])).toBe('Sign text');
    par.renderAt(3.0); // end is exclusive
    expect(lines(par.element).map((l) => l.dataset.parId)).toEqual(['0']);
    par.destroy();
  });

  it('never renders Comment lines', () => {
    const par = create({ container: makeContainer(), subtitle: SAMPLE });
    par.renderAt(1.5);
    expect(par.element.textContent).not.toContain('not rendered');
  });

  it('builds a line once and reuses its DOM across frames', () => {
    const par = create({ container: makeContainer(), subtitle: SAMPLE });
    par.renderAt(1.1);
    const first = lines(par.element)[0];
    par.renderAt(1.2);
    par.renderAt(2.0);
    expect(lines(par.element)[0]).toBe(first);
  });

  it('updates animated properties in place', () => {
    const sub = SAMPLE + '\r\nDialogue: 0,0:00:10.00,0:00:11.00,Default,,0,0,0,,{\\move(0,0,1000,0)\\fad(0,0)}moving';
    const par = create({ container: makeContainer(), subtitle: sub });
    par.renderAt(10.0);
    const box = par.element.querySelector<HTMLElement>('.par-line[data-par-id="3"] .par-box')!;
    expect(box.style.left).toBe('0px');
    par.renderAt(10.5);
    expect(par.element.querySelector('.par-line[data-par-id="3"] .par-box')).toBe(box);
    expect(box.style.left).toBe('500px');
  });

  it('overlay never intercepts pointer events and is removed on destroy', () => {
    const container = makeContainer();
    const par = create({ container, subtitle: SAMPLE });
    expect(par.element.style.pointerEvents).toBe('none');
    expect(container.contains(par.element)).toBe(true);
    par.destroy();
    expect(container.querySelector('.par-root')).toBeNull();
    expect(() => par.renderAt(1)).toThrow(/destroyed/);
  });

  it('places the stage on the region with the layout scale', () => {
    const par = create({ container: makeContainer(960, 540), subtitle: SAMPLE, region: 'container' });
    const m = par.getMetrics();
    expect(m.layout).toEqual({ width: 1920, height: 1080 });
    expect(m.scaleX).toBe(0.5);
    expect(m.scaleY).toBe(0.5);
    par.setOptions({ region: { x: 10, y: 20, width: 192, height: 108 }, layout: { width: 640, height: 360 } });
    expect(par.getMetrics()).toMatchObject({ region: { x: 10, y: 20, width: 192, height: 108 }, layout: { width: 640, height: 360 }, scaleX: 0.3 });
    const stage = par.element.querySelector<HTMLElement>('.par-stage')!;
    expect(stage.style.width).toBe('640px');
    expect(stage.style.left).toBe('10px');
  });

  it('follows a video: letterboxed region and video time', () => {
    const container = makeContainer(800, 600);
    const video = document.createElement('video');
    container.appendChild(video);
    Object.defineProperty(video, 'videoWidth', { value: 1600 });
    Object.defineProperty(video, 'videoHeight', { value: 900 });
    Object.defineProperty(video, 'clientWidth', { value: 800 });
    Object.defineProperty(video, 'clientHeight', { value: 600 });
    Object.defineProperty(video, 'currentTime', { value: 2.7, writable: true });
    const par = create({ video, subtitle: SAMPLE });
    expect(par.getMetrics().region).toEqual({ x: 0, y: 75, width: 800, height: 450 });
    expect(par.getMetrics().time).toBeCloseTo(2.7);
    expect(lines(par.element)).toHaveLength(2);
    video.currentTime = 4.5;
    video.dispatchEvent(new Event('seeked'));
    expect(lines(par.element)).toHaveLength(0);
  });

  it('accepts a custom clock and a time offset', () => {
    let now = 0;
    const par = create({ container: makeContainer(), subtitle: SAMPLE, clock: () => now, timeOffset: 1 });
    now = 0.5;
    par.refresh();
    expect(lines(par.element)).toHaveLength(1);
    par.destroy();
  });

  it('validates options', () => {
    const container = makeContainer();
    expect(() => create({ container, fps: 5 })).toThrow(RangeError);
    expect(() => create({ container, fps: 500 })).toThrow(RangeError);
    expect(() => create({ container, region: { x: 0, y: 0, width: 0, height: 1 } })).toThrow(TypeError);
    expect(() => create({})).toThrow(TypeError);
    expect(() => create({ container, fps: 24, layout: { width: 1280, height: 720 } })).not.toThrow();
  });

  it('snaps to video frames only when videoFps is set', () => {
    expect(snapToFrame(1.03, 10)).toBeCloseTo(1.0);
    expect(snapToFrame(0.1 * 3, 10)).toBeCloseTo(0.3);
    expect(snapToFrame(1.03, null)).toBe(1.03);
  });

  it('renders drawings as SVG paths and clips via clip-path', () => {
    const sub = SAMPLE + '\r\nDialogue: 0,0:00:20.00,0:00:21.00,Default,,0,0,0,,{\\an7\\pos(0,0)\\p1}m 0 0 l 100 0 100 100 0 100';
    const par = create({ container: makeContainer(), subtitle: sub });
    par.renderAt(20.5);
    const path = par.element.querySelector('path')!;
    expect(path.getAttribute('d')).toBe('M 0 0 L 100 0 L 100 100 L 0 100 Z');
    expect(path.getAttribute('fill')).toBe('rgba(255, 255, 255, 1)');
  });

  it('can swap and clear the subtitle', () => {
    const par = create({ container: makeContainer(), subtitle: SAMPLE });
    par.renderAt(2.6);
    par.setSubtitle(null);
    expect(lines(par.element)).toHaveLength(0);
    expect(par.script).toBeNull();
    par.setSubtitle(SAMPLE);
    par.renderAt(2.6);
    expect(lines(par.element)).toHaveLength(2);
  });
});
