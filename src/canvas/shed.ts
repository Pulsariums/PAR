/** Load shedding of the canvas path: when frames run late, the least visible sprites are not drawn until they stop being late. */

export interface Candidate {
  /** Pixels the draw would fill (sprite bitmap, device pixels). */
  area: number;
  /** Final opacity 0..1. */
  alpha: number;
  /** Not drawn in the last frame (kept out unless clearly worth it, so items do not flicker in and out). */
  wasShed: boolean;
}

/**
 * Visual weight per filled pixel: opaque and small things matter, faint and large ones (glows, blur margins) do not. A sprite that
 * was already left out needs a clearly higher weight to come back.
 */
export const weight = (c: Candidate): number => (c.alpha / (1 + c.area / 4000)) * (c.wasShed ? 0.7 : 1.15);

/** Indexes to leave out so that the rest fills at most `budget` pixels (lowest weight first). Empty when it already fits. */
export const pickShed = (items: readonly Candidate[], budget: number): Set<number> => {
  const out = new Set<number>();
  if (!(budget < Infinity)) return out;
  let total = 0;
  for (const c of items) total += c.area;
  if (total <= budget) return out;
  const order = items.map((_, i) => i).sort((a, b) => weight(items[a]) - weight(items[b]));
  for (const i of order) {
    if (total <= budget) break;
    out.add(i);
    total -= items[i].area;
  }
  return out;
};

const MIN_FRACTION = 0.25;
/**
 * Cutting pixels only helps when compositing (drawing the finished sprites) is a real part of the frame. Frames that run late because
 * sprites are being built (a burst of new events) or because the page does other work do not get cheaper by leaving sprites out, and
 * leaving them out only costs picture. Below this smoothed composite time (ms per frame) the controller holds or releases.
 */
export const MIN_COMPOSITE_MS = 4;
/** Compositing on a GPU canvas costs the page little JS time but real fill time, so a frame that asks for this many stages of pixels is cut regardless. */
const OVERDRAW = 2;

/**
 * Pixel budget per frame. Infinity (nothing shed) until frames come late; then it is cut to 85 % of what the last frame filled,
 * every few frames while the lateness lasts, down to a quarter of the stage; when frames are on time again it grows by 8 % per
 * step and switches off once it is well above what scenes ask for. `late` is the share of recent frames that were late.
 */
export class ShedController {
  budget = Infinity;
  private smooth = 0;
  private since = 0;
  private composite = Infinity;

  /**
   * `filled`: pixels the last frame asked for, `stage`: stage pixels, `compositeMs`: time the last frame spent drawing finished sprites
   * (not building them; omit when unknown). Returns the budget for the next frame.
   */
  update(late: number, filled: number, stage: number, compositeMs = Infinity): number {
    this.composite = this.composite === Infinity || compositeMs === Infinity ? compositeMs : this.composite * 0.8 + compositeMs * 0.2;
    this.smooth = this.smooth * 0.8 + (this.composite < MIN_COMPOSITE_MS && filled < OVERDRAW * stage ? 0 : late) * 0.2;
    if (++this.since < 6) return this.budget;
    this.since = 0;
    const floor = stage * MIN_FRACTION;
    if (this.smooth > 0.25) {
      const base = this.budget < Infinity ? Math.min(this.budget, filled) : filled;
      this.budget = Math.max(floor, base * 0.85);
    } else if (this.smooth < 0.08 && this.budget < Infinity) {
      this.budget *= 1.08;
      if (this.budget > Math.max(filled, stage) * 3) this.budget = Infinity;
    }
    return this.budget;
  }

  /** Back to full quality (paused, scene cleared). */
  reset(): void {
    this.budget = Infinity;
    this.smooth = 0;
    this.since = 0;
    this.composite = Infinity;
  }
}
