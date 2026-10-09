import type { Size } from '../layout/Layout';
import type { Overlay } from '../render/Overlay';

export interface Slot {
  el: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  attached: boolean;
  dirty: boolean;
}

export interface SlotProfile {
  stateChange(): void;
  drawOp(): void;
}

/**
 * The pool of canvas elements the canvas path draws into: one per run of consecutive canvas events, each as large as the stage
 * (layout size) with a device-resolution backing store, created on demand, attached at their z-order position, cleared and
 * detached when no run needs them.
 */
export class Slots {
  private readonly list: Slot[] = [];
  private size = { w: 0, h: 0, f: 0 };
  private layout: Size = { width: 0, height: 0 };
  private profile: SlotProfile | null = null;

  constructor(private readonly overlay: Overlay, readonly max: number) {}

  setProfile(profile: SlotProfile | null): void { this.profile = profile; }

  /** Device pixels per layout unit and the backing store's size in pixels. */
  get f(): number { return this.size.f; }
  get stagePx(): number { return this.size.w * this.size.h; }

  /** Backing store size follows the stage: `f` = device pixels per layout unit. */
  resize(layout: Size, f: number): void {
    const w = Math.max(1, Math.round(layout.width * f));
    const h = Math.max(1, Math.round(layout.height * f));
    this.layout = layout;
    if (w === this.size.w && h === this.size.h && f === this.size.f) return;
    this.size = { w, h, f };
    for (const s of this.list) this.fit(s);
  }

  private fit(s: Slot): void {
    s.el.width = this.size.w;
    s.el.height = this.size.h;
    s.el.style.width = `${this.layout.width}px`;
    s.el.style.height = `${this.layout.height}px`;
    s.dirty = false;
  }

  private slot(i: number): Slot | null {
    if (i >= this.max) return null;
    while (this.list.length <= i) {
      const el = document.createElement('canvas');
      el.className = 'par-canvas';
      el.style.position = 'absolute';
      el.style.left = '0px';
      el.style.top = '0px';
      const ctx = el.getContext('2d');
      if (!ctx) return null;
      const s = { el, ctx, attached: false, dirty: false };
      this.fit(s);
      this.list.push(s);
    }
    return this.list[i];
  }

  /** The cleared canvas of run `i`, attached at (`layer`, `index`) in the overlay. Null when there is no such canvas. */
  open(i: number, layer: number, index: number): CanvasRenderingContext2D | null {
    const s = this.slot(i);
    if (!s) return null;
    s.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.profile?.stateChange();
    s.ctx.clearRect(0, 0, s.el.width, s.el.height);
    this.profile?.drawOp();
    s.dirty = true;
    const key = `${layer}:${index}`;
    if (!s.attached || s.el.dataset.parRun !== key) {
      s.el.remove();
      s.el.dataset.parRun = key;
      this.overlay.insert(s.el, layer, index);
      s.attached = true;
    }
    return s.ctx;
  }

  /** Clears and detaches the canvases from run `from` on (no run needs them). */
  closeFrom(from: number): void {
    for (let i = from; i < this.list.length; i++) {
      const s = this.list[i];
      if (s.dirty) {
        s.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.profile?.stateChange();
        s.ctx.clearRect(0, 0, s.el.width, s.el.height);
        this.profile?.drawOp();
        s.dirty = false;
      }
      if (s.attached) { s.el.remove(); s.attached = false; delete s.el.dataset.parRun; }
    }
  }

  /** Drops the canvases (the stage is gone or the renderer is destroyed). */
  destroy(): void {
    for (const s of this.list) { s.el.remove(); s.el.width = 0; s.el.height = 0; }
    this.list.length = 0;
  }
}
