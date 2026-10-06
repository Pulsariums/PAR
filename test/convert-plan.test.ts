import { describe, expect, it } from 'vitest';

import { sniff } from '../src/format';
import { FPS_PRESETS, VERIFY_AUTO_BYTES, actionsFor, outputName, parseFps, ratioPct, shouldVerify } from '../site/src/convert/plan';

const ass = new TextEncoder().encode('[Script Info]\nTitle: x\n');

describe('converter plan', () => {
  it('detects by content, not by extension', () => {
    expect(sniff(ass).kind).toBe('ass');
    expect(sniff(new TextEncoder().encode('hello world')).kind).toBe('unknown');
    expect(sniff(new Uint8Array(0)).kind).toBe('unknown');
  });

  it('offers the right actions per kind', () => {
    expect(actionsFor('ass')).toEqual(['xpar', 'par']);
    expect(actionsFor('xpar')).toEqual(['ass']);
    expect(actionsFor('par')).toEqual(['ass']);
    expect(actionsFor('unknown')).toEqual([]);
  });

  it('names outputs: xpar, <fps>fps.par, ass and baked.ass', () => {
    expect(outputName('xpar', 'Episode 01.ass', 'ass', 24)).toBe('Episode 01.xpar');
    expect(outputName('par', 'e.ass', 'ass', 24)).toBe('e.24fps.par');
    expect(outputName('par', 'e.ass', 'ass', 23.976)).toBe('e.23.976fps.par');
    expect(outputName('ass', 'e.xpar', 'xpar', 24)).toBe('e.ass');
    expect(outputName('ass', 'e.par', 'par', 24)).toBe('e.baked.ass');
    expect(outputName('ass', 'e.24fps.par', 'par', 24)).toBe('e.24fps.baked.ass');
    expect(outputName('xpar', '.ass', 'ass', 24)).toBe('subtitles.xpar');
    expect(outputName('xpar', 'noext', 'ass', 24)).toBe('noext.xpar');
  });

  it('lists the preset frame rates and keeps 24 among them', () => {
    expect([...FPS_PRESETS]).toEqual([23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60]);
  });

  it('validates a custom fps', () => {
    expect(parseFps('29,97')).toBe(29.97);
    expect(parseFps(' 23.976 ')).toBe(23.976);
    expect(parseFps('23.97649')).toBe(23.976);
    expect(parseFps('1000')).toBe(1000);
    for (const bad of ['', 'abc', '0', '0.4', '1001', '-5', '1e3', '24fps', 'NaN', '1.2.3']) expect(parseFps(bad), bad).toBeNull();
  });

  it('verifies XPAR output by default only for files up to the size limit', () => {
    expect(shouldVerify('xpar', true, false, 1000)).toBe(true);
    expect(shouldVerify('xpar', true, false, VERIFY_AUTO_BYTES + 1)).toBe(false);
    expect(shouldVerify('xpar', true, true, VERIFY_AUTO_BYTES + 1)).toBe(true);
    expect(shouldVerify('xpar', false, true, 10)).toBe(false);
    expect(shouldVerify('par', true, true, 10)).toBe(false);
    expect(shouldVerify('ass', true, true, 10)).toBe(false);
  });

  it('formats the ratio', () => {
    expect(ratioPct(250, 1000)).toBe('25%');
    expect(ratioPct(1, 3)).toBe('33.3%');
    expect(ratioPct(5, 0)).toBe('-');
  });
});
