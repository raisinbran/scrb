import { readStored } from './stored-value.ts';

export const VOLUME_KEY = 'scrb.playback.volume';
export const MUTED_KEY = 'scrb.playback.muted';

export function storedVolume(): number {
  const value = readStored<number>(VOLUME_KEY);
  return typeof value === 'number' && value >= 0 && value <= 1 ? value : 1;
}

/** The app's own playback level as the player last stored it. Silent at zero volume too. */
export function readPlaybackLevel(): { volume: number; muted: boolean } {
  const volume = storedVolume();
  return { volume, muted: readStored<boolean>(MUTED_KEY) === true || volume === 0 };
}
