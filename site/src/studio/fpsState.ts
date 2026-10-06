import { defaultFps } from './exportPlan';

/** The video frame rate of the Studio, in one place: what the user picked, else what the video measured. Frame step, PAR's frame grid and the export default all read it. */
export class VideoFpsState {
  picked: number | null = null;
  detected: number | null = null;

  /** `videoFps` option for PAR: null = no frame grid (time goes straight to ms). */
  get option(): number | null { return this.picked ?? this.detected; }
  /** Frame rate for stepping and as the export default (24 when nothing is known). */
  get steps(): number { return defaultFps(this.picked, this.detected); }
}
