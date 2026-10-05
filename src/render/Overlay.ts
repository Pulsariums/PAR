import type { Size } from '../layout/Layout';
import type { Rect } from '../types/options';

import { div } from './dom';

const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const r6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * Overlay root (covers the container, never intercepts pointer events) and the stage:
 * a box of the virtual layout size, scaled onto the region with one CSS transform.
 * Resizing therefore only touches the stage transform, never the lines.
 */
export class Overlay {
  readonly root: HTMLDivElement;
  readonly stage: HTMLDivElement;
  private restorePosition: string | null = null;

  constructor(private readonly container: HTMLElement, zIndex: number) {
    this.root = div('par-root', {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      'pointer-events': 'none',
      'user-select': 'none',
      'z-index': String(zIndex),
    });
    this.root.setAttribute('aria-hidden', 'true');
    this.stage = div('par-stage', {
      position: 'absolute',
      overflow: 'hidden',
      'transform-origin': '0 0',
    });
    this.root.appendChild(this.stage);
    const view = container.ownerDocument.defaultView;
    if (view && view.getComputedStyle(container).position === 'static') {
      this.restorePosition = container.style.position;
      container.style.position = 'relative';
    }
    container.appendChild(this.root);
  }

  setZIndex(z: number): void {
    this.root.style.setProperty('z-index', String(z));
  }

  /** Places the stage (layout space) onto `region` (container px). */
  place(region: Rect, layout: Size): void {
    const s = this.stage.style;
    s.setProperty('left', `${r3(region.x)}px`);
    s.setProperty('top', `${r3(region.y)}px`);
    s.setProperty('width', `${layout.width}px`);
    s.setProperty('height', `${layout.height}px`);
    const sx = layout.width > 0 ? region.width / layout.width : 0;
    const sy = layout.height > 0 ? region.height / layout.height : 0;
    s.setProperty('transform', `scale(${r6(sx)}, ${r6(sy)})`);
  }

  /** Inserts a line root keeping DOM order = (layer, file order), as libass composites. */
  insert(el: HTMLElement, layer: number, index: number): void {
    el.dataset.parLayer = String(layer);
    el.dataset.parIndex = String(index);
    for (const child of Array.from(this.stage.children) as HTMLElement[]) {
      const l = Number(child.dataset.parLayer);
      const i = Number(child.dataset.parIndex);
      if (l > layer || (l === layer && i > index)) {
        this.stage.insertBefore(el, child);
        return;
      }
    }
    this.stage.appendChild(el);
  }

  destroy(): void {
    this.root.remove();
    if (this.restorePosition !== null) this.container.style.position = this.restorePosition;
  }
}
