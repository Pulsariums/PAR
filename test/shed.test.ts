import { describe, expect, it } from 'vitest';

import { pickShed, ShedController, weight, type Candidate } from '../src/canvas/shed';
import { LoadMeter } from '../src/core/LoadMeter';

const c = (area: number, alpha: number, wasShed = false): Candidate => ({ area, alpha, wasShed });

describe('pickShed', () => {
  it('drops nothing when the frame fits or there is no limit', () => {
    expect(pickShed([c(1000, 1), c(2000, 1)], Infinity).size).toBe(0);
    expect(pickShed([c(1000, 1), c(2000, 1)], 3000).size).toBe(0);
  });

  it('drops faint, large sprites before opaque, small ones, only as many as needed', () => {
    const items = [c(900, 1), c(200000, 0.2), c(1200, 0.9), c(80000, 0.5), c(700, 1)];
    const out = pickShed(items, 5000);
    expect([...out].sort()).toEqual([1, 3]);
    expect(items.filter((_, i) => !out.has(i)).reduce((n, x) => n + x.area, 0)).toBeLessThanOrEqual(5000);
    expect(pickShed(items, 100000).has(1)).toBe(true);
    expect(pickShed(items, 100000).size).toBe(1);
  });

  it('keeps what was left out last frame out unless it clearly outranks the rest (no flicker)', () => {
    expect(weight(c(1000, 0.5, true))).toBeLessThan(weight(c(1000, 0.5, false)));
    const same = [c(1000, 0.5, true), c(1000, 0.5, false)];
    expect([...pickShed(same, 1000)]).toEqual([0]);
  });
});

describe('ShedController', () => {
  const stage = 1_000_000;

  it('does nothing while frames are on time', () => {
    const s = new ShedController();
    for (let i = 0; i < 60; i++) s.update(0, 2_000_000, stage);
    expect(s.budget).toBe(Infinity);
  });

  it('cuts the budget while frames are late, never below a quarter of the stage', () => {
    const s = new ShedController();
    let prev = Infinity;
    for (let i = 0; i < 400; i++) {
      s.update(0.8, 3_000_000, stage);
      expect(s.budget).toBeLessThanOrEqual(prev);
      prev = s.budget;
    }
    expect(s.budget).toBeLessThan(3_000_000);
    expect(s.budget).toBeGreaterThanOrEqual(stage * 0.25);
  });

  it('recovers and switches off when frames are on time again', () => {
    const s = new ShedController();
    for (let i = 0; i < 120; i++) s.update(0.8, 3_000_000, stage);
    expect(s.budget).toBeLessThan(Infinity);
    for (let i = 0; i < 2000 && s.budget < Infinity; i++) s.update(0, 1_500_000, stage);
    expect(s.budget).toBe(Infinity);
  });

  it('reset returns to full quality at once', () => {
    const s = new ShedController();
    for (let i = 0; i < 120; i++) s.update(0.8, 3_000_000, stage);
    s.reset();
    expect(s.budget).toBe(Infinity);
  });
});

describe('LoadMeter', () => {
  it('reports no lateness until it knows the display frame', () => {
    const m = new LoadMeter();
    for (let i = 0; i < 10; i++) m.add(40);
    expect(m.late()).toBe(0);
  });

  it('counts frames well beyond the display frame, ignoring hidden-tab gaps', () => {
    const m = new LoadMeter();
    for (let i = 0; i < 100; i++) m.add(16.7);
    expect(m.late()).toBe(0);
    m.add(5000);
    expect(m.late()).toBe(0);
    for (let i = 0; i < 15; i++) m.add(60);
    expect(m.late()).toBeCloseTo(0.5, 5);
    expect(m.frame).toBeCloseTo(16.7, 1);
  });

  it('a machine that is always slow is still seen as late (the baseline is the fast end, not the median)', () => {
    const m = new LoadMeter();
    for (let i = 0; i < 20; i++) m.add(16.7);
    for (let i = 0; i < 200; i++) m.add(i % 8 === 0 ? 16.7 : 50);
    expect(m.late()).toBeGreaterThan(0.5);
  });
});
