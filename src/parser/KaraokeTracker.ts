import type { KaraokeSpan, KaraokeType } from '../types/script';

export interface KaraTag {
  type: KaraokeType | 'kt';
  /** centiseconds (ASS unit) */
  cs: number;
}

/**
 * Karaoke timing (libass): every `\k*` starts a syllable; durations accumulate from the line start.
 * Consecutive `\k` tags without text in between skip the previous duration; `\kt` sets an absolute
 * cursor. Blocks without karaoke tags (e.g. `{\b1}`) keep the current syllable.
 * Continuation text of a syllable (`{\kf100}Hel{\b1}lo`) has no timing of its own (libass:
 * effect_timing = 0): the first piece takes the whole syllable, the continuation switches at its end.
 */
export class KaraokeTracker {
  private cursor = 0;
  private syllable = -1;
  private pending: { type: KaraokeType; duration: number } | null = null;
  private current: KaraokeSpan | null = null;
  private taken = false;

  apply(tags: KaraTag[]): void {
    for (const t of tags) {
      if (t.type === 'kt') {
        this.cursor = t.cs * 10;
        continue;
      }
      if (this.pending) this.cursor += this.pending.duration;
      this.pending = { type: t.type, duration: t.cs * 10 };
    }
  }

  /** Syllable for the next text fragment (undefined before the first `\k`). */
  take(): KaraokeSpan | undefined {
    if (this.pending) {
      this.syllable++;
      this.current = { type: this.pending.type, start: this.cursor, duration: this.pending.duration, syllable: this.syllable };
      this.cursor += this.pending.duration;
      this.pending = null;
      this.taken = false;
    }
    if (!this.current) return undefined;
    const c = this.current;
    if (this.taken) return { ...c, start: c.start + c.duration, duration: 0 };
    this.taken = true;
    return { ...c };
  }
}
