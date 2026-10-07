import { describe, expect, it } from 'vitest';

import { Player } from '../site/src/player/player';
import { FpsMeter, fpsText } from '../site/src/player/fpsMeter';
import { VideoFpsState } from '../site/src/studio/fpsState';
import { HEAVY_LINES, HeavyHint, renderRows, type Render } from '../site/src/studio/metricRows';
import { regionFor, studioMode } from '../site/src/studio/mode';

describe('measured FPS (metrics panel)', () => {
  it('is an em dash, not 0, until something is measured', () => {
    expect(fpsText(null)).toBe('—');
    expect(fpsText(0)).toBe('0');
    expect(fpsText(58)).toBe('58');
    expect(new FpsMeter().fps).toBeNull();
  });

  it('measures only while playing: 30 distinct times in one second read 30', () => {
    const m = new FpsMeter();
    m.sample(0, true, 0);
    for (let i = 1; i <= 30; i++) m.sample(i / 30, true, (i * 1000) / 30);
    expect(m.fps).toBe(30);
  });

  it('goes back to null when paused and counts nothing while paused', () => {
    const m = new FpsMeter();
    m.sample(0, true, 0);
    for (let i = 1; i <= 60; i++) m.sample(i / 60, true, (i * 1000) / 60);
    expect(m.fps).toBe(60);
    m.sample(1, false, 1100);
    expect(m.fps).toBeNull();
    for (let i = 0; i < 40; i++) m.sample(1 + i, false, 1200 + i * 100);
    expect(m.fps).toBeNull();
  });

  it('starts a fresh window on resume (the paused gap does not dilute the rate)', () => {
    const m = new FpsMeter();
    m.sample(5, false, 10_000);
    m.sample(5, true, 20_000);
    for (let i = 1; i <= 24; i++) m.sample(5 + i / 24, true, 20_000 + (i * 1000) / 24);
    expect(m.fps).toBe(24);
  });

  it('keeps counting equal times once: a frozen clock (seek storm, buffering) is not 60 fps', () => {
    const m = new FpsMeter();
    m.sample(3, true, 0);
    for (let i = 1; i <= 60; i++) m.sample(3, true, (i * 1000) / 60);
    expect(m.fps).toBe(0);
  });

  it('asks for a redraw twice a second, playing or not', () => {
    const m = new FpsMeter();
    const hits = (playing: boolean, from: number): number => { let n = 0; for (let t = 0; t <= 2000; t += 16) if (m.sample(t, playing, from + t)) n++; return n; };
    expect(hits(false, 100_000)).toBeGreaterThanOrEqual(3);
    expect(hits(true, 200_000)).toBeGreaterThanOrEqual(3);
  });
});

const render = (over: Partial<Render> = {}): Render => ({
  mode: 'auto', canvasSupported: true, domLines: 3, canvasLines: 400, canvasRuns: 2, runsMerged: 0, drawn: 380, fillMpx: 4.2, shed: 0, shedBudgetMpx: 0, sprites: 120, spriteBytes: 2 * 1048576,
  spriteHits: 90, spriteMisses: 10, prewarmed: 7, evictions: 1, detailDropped: 4, skipped: 0, frameMs: { p50: 4.04, p95: 13.26, samples: 50 }, ...over,
});

describe('render metric rows', () => {
  it('prints lines per path, sprite cache, dropped / skipped and frame time', () => {
    const rows = Object.fromEntries(renderRows(render()).map((r) => [r.key, r.value]));
    expect(rows['st.m.paths']).toBe('3 / 400 (2 canvas)');
    expect(rows['st.m.sprites']).toBe('120 (2.0 MB)');
    expect(rows['st.m.cache']).toBe('90% hit, 1 evicted, 7 prewarmed');
    expect(rows['st.m.drawn']).toBe('380 / 4.20 Mpx');
    expect(rows['st.m.dropped']).toBe('4 / 0');
    expect(rows['st.m.frameMs']).toBe('4.0 / 13.3 ms');
  });

  it('shows dashes when nothing was measured, and flags a browser without canvas', () => {
    const rows = Object.fromEntries(renderRows(render({ spriteHits: 0, spriteMisses: 0, frameMs: { p50: 0, p95: 0, samples: 0 }, canvasSupported: false, runsMerged: 2 })).map((r) => [r.key, r.value]));
    expect(rows['st.m.cache']).toContain('— hit');
    expect(rows['st.m.frameMs']).toBe('—');
    expect(rows['st.m.mode']).toBe('auto (no canvas)');
    expect(rows['st.m.paths']).toContain('2 merged');
  });
});

describe('Heavy scene hint', () => {
  it('stays off below the threshold', () => {
    expect(new HeavyHint().update(HEAVY_LINES - 1, 'auto', 0)).toBe('none');
  });

  it('advises switching the mode in dom mode and tuning otherwise, and holds 3 s after the burst', () => {
    const h = new HeavyHint();
    expect(h.update(900, 'dom', 0)).toBe('dom');
    expect(h.update(900, 'auto', 100)).toBe('auto');
    expect(h.update(2, 'canvas', 2000)).toBe('auto');
    expect(h.peak).toBe(900);
    expect(h.update(2, 'canvas', 3200)).toBe('none');
    expect(h.peak).toBe(0);
  });
});

describe('video fps state', () => {
  it('prefers the pick, then the detected rate, then 24 for stepping', () => {
    const s = new VideoFpsState();
    expect([s.option, s.steps]).toEqual([null, 24]);
    s.detected = 23.976;
    expect([s.option, s.steps]).toEqual([23.976, 23.976]);
    s.picked = 30;
    expect([s.option, s.steps]).toEqual([30, 30]);
    s.picked = null;
    s.detected = null;
    expect([s.option, s.steps]).toEqual([null, 24]);
  });
});

describe('no-video mode', () => {
  it('names the four states and puts the region on the picture only with a video', () => {
    expect(studioMode(false, false)).toBe('card');
    expect(studioMode(false, true)).toBe('card+sub');
    expect(studioMode(true, false)).toBe('video');
    expect(studioMode(true, true)).toBe('video+sub');
    expect(regionFor(true)).toBe('video');
    expect(regionFor(false)).toBe('container');
  });

  it('the player starts on the test card (clock driven, no video) and returns to it when the video goes', () => {
    const stage = document.createElement('div');
    const video = document.createElement('video');
    video.pause = (): void => undefined;
    video.load = (): void => undefined;
    const player = new Player(stage, document.createElement('canvas'), video, '');
    expect(player.hasVideo).toBe(false);
    expect(player.transport).toBe(player.card);
    player.useVideo('blob:x');
    expect(player.hasVideo).toBe(true);
    expect(player.transport).not.toBe(player.card);
    expect(video.hidden).toBe(false);
    player.useCard();
    expect(player.hasVideo).toBe(false);
    expect(player.transport).toBe(player.card);
    expect(video.hidden).toBe(true);
  });

  it('the card clock drives PAR: seeking the card moves the rendered time with no video', () => {
    const player = new Player(document.createElement('div'), document.createElement('canvas'), document.createElement('video'), '');
    player.setSubtitle('[Script Info]\nPlayResX: 1280\nPlayResY: 720\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize\nStyle: Default,Arial,40\n[Events]\nFormat: Layer, Start, End, Style, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,hi');
    player.card.seek(1.5);
    player.par.renderAt?.(player.card.time);
    expect(player.par.getMetrics().activeLines).toBe(1);
    player.card.seek(3);
    player.par.renderAt?.(player.card.time);
    expect(player.par.getMetrics().activeLines).toBe(0);
  });
});
