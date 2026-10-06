import type { RegionOption } from '../../../src/index';

export type StudioMode = 'video+sub' | 'video' | 'card+sub' | 'card';

/** What the player shows: a video or the generated test card (no video needed), with or without a subtitle. */
export const studioMode = (hasVideo: boolean, hasSub: boolean): StudioMode => `${hasVideo ? 'video' : 'card'}${hasSub ? '+sub' : ''}` as StudioMode;

/** Subtitle region: on the visible picture with a video, on the whole stage (the test card fills it) without one. */
export const regionFor = (hasVideo: boolean): RegionOption => (hasVideo ? 'video' : 'container');
