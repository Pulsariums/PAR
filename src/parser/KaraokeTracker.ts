import type { Fragment, KaraokeSpan, KaraokeType } from '../types/script';

export interface KaraTag {
  type: KaraokeType | 'kt';
  /** centiseconds (ASS unit) */
  cs: number;
}

/**
 * Karaoke timing (libass): every `\k*` starts a syllable; durations accumulate from the line start.
 * Consecutive `\k` tags without text in between skip the previous duration; `\kt` sets an absolute
 * cursor. Blocks without karaoke tags (e.g. `{\b1}`) keep the current syllable.
 */
export class KaraokeTracker {
  private cursor = 0;
  private syllable = -1;
  private pending: { type: KaraokeType; duration: number } | null = null;
  private current: KaraokeSpan | null = null;

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
    }
    return this.current ? { ...this.current } : undefined;
  }
}

/**
 * A `\kf` syllable split over several fragments (`{\kf50}Hel{\b1}lo`) is swept as one unit:
 * each fragment gets a slice of the syllable window proportional to its text length.
 */
export const splitSyllables = (fragments: Fragment[]): void => {
  const groups = new Map<number, Fragment[]>();
  for (const f of fragments) {
    if (!f.karaoke) continue;
    const g = groups.get(f.karaoke.syllable);
    if (g) g.push(f);
    else groups.set(f.karaoke.syllable, [f]);
  }
  for (const group of groups.values()) {
    if (group.length < 2 || group[0].karaoke!.type !== 'kf') continue;
    const weights = group.map((f) => Math.max(1, f.drawing ? 1 : [...f.text].length));
    const total = weights.reduce((a, b) => a + b, 0);
    const { start, duration } = group[0].karaoke!;
    let acc = 0;
    group.forEach((f, i) => {
      const k = f.karaoke!;
      k.start = start + (duration * acc) / total;
      k.duration = (duration * weights[i]) / total;
      acc += weights[i];
    });
  }
};
