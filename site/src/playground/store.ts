/** Single source of truth for every playground setting. UI modules read and patch it; only `apply` touches PAR. */

export type Source = 'card' | 'file' | 'url';
export type RegionMode = 'video' | 'container' | 'custom';

export interface Settings {
  source: Source;
  region: RegionMode;
  rect: { x: number; y: number; width: number; height: number };
  layoutCustom: boolean;
  layout: { width: number; height: number };
  fpsAuto: boolean;
  fps: number;
  /** Raw text of the Video FPS field; empty = off. */
  videoFps: string;
  timeOffset: number;
  zIndex: number;
  fit: 'contain' | 'cover' | 'fill';
}

export const DEFAULTS: Settings = {
  source: 'card',
  region: 'container',
  rect: { x: 120, y: 60, width: 720, height: 405 },
  layoutCustom: false,
  layout: { width: 1920, height: 1080 },
  fpsAuto: true,
  fps: 60,
  videoFps: '',
  timeOffset: 0,
  zIndex: 1,
  fit: 'contain',
};

type Listener = (s: Settings, changed: (keyof Settings)[]) => void;

export class Store {
  private s: Settings = { ...DEFAULTS, rect: { ...DEFAULTS.rect }, layout: { ...DEFAULTS.layout } };
  private readonly listeners = new Set<Listener>();

  get(): Readonly<Settings> {
    return this.s;
  }

  patch(p: Partial<Settings>): void {
    const changed = (Object.keys(p) as (keyof Settings)[]).filter((k) => JSON.stringify(this.s[k]) !== JSON.stringify(p[k]));
    if (!changed.length) return;
    this.s = { ...this.s, ...p };
    this.listeners.forEach((fn) => fn(this.s, changed));
  }

  subscribe(fn: Listener): void {
    this.listeners.add(fn);
  }
}
