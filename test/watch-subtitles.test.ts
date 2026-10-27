import { describe, expect, it } from 'vitest';

import { openSource } from '../src/source';
import { toAss } from '../site/src/watch/subtitles';

describe('player SRT / WebVTT intake', () => {
  it('turns SRT cues into ASS events the renderer opens', async () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:03,500\r\n<i>Merhaba</i> {dünya}\r\nikinci satır\r\n\r\n2\n01:02:03,4 --> 01:02:05,000\nSon\n';
    const ass = toAss(srt);
    expect(ass).not.toBeNull();
    expect(ass).toContain('Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\\i1}Merhaba{\\i0} (dünya)\\Nikinci satır');
    expect(ass).toContain('Dialogue: 0,1:02:03.40,1:02:05.00,Default,,0,0,0,,Son');
    const source = await openSource(ass!);
    expect(source.eventCount).toBe(2);
  });

  it('reads WebVTT cues with identifiers and skips header and notes', () => {
    const vtt = 'WEBVTT\n\nNOTE hello\n\nintro\n00:05.000 --> 00:07.250 align:start\n<b>Selam</b>\n';
    const ass = toAss(vtt);
    expect(ass).toContain('Dialogue: 0,0:00:05.00,0:00:07.25,Default,,0,0,0,,{\\b1}Selam{\\b0}');
    expect(ass).not.toContain('NOTE');
  });

  it('returns null when there is no cue', () => {
    expect(toAss('WEBVTT\n\nNOTE nothing here\n')).toBeNull();
  });
});
