import { describe, expect, it } from 'vitest';

import { parseScript } from '../src/index';
import { FEATURES } from '../site/src/playground/features';
import { PRESETS, presetById } from '../site/src/presets';

describe('playground presets', () => {
  it('has unique ids', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });

  it.each(PRESETS.map((p) => [p.id, p.ass] as const))('%s parses without warnings and has events', (_id, ass) => {
    const s = parseScript(ass);
    expect(s.warnings).toEqual([]);
    expect(s.events.length).toBeGreaterThan(0);
    expect(s.info.playResX).toBe(1280);
  });

  it('every feature row points at an existing preset', () => {
    for (const f of FEATURES) expect(presetById(f.preset), f.label).toBeDefined();
  });

  it('stress preset has 90 simultaneous lines', () => {
    expect(parseScript(presetById('stress')!.ass).events).toHaveLength(90);
  });
});
