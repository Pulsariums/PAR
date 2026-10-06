/**
 * Finishes a frame that shipped reduced (blurs left out, sprites deferred because the frame ran out of build time): asks for one more
 * draw of the same time on the next turn, until the frame is complete. A paused video would otherwise keep the reduced frame.
 */
export class Refiner {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly redraw: () => void) {}

  request(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => { this.timer = null; this.redraw(); }, 0);
  }

  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
