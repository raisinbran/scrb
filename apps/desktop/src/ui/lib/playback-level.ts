import { readStored } from './stored-value.ts';

export const VOLUME_KEY = 'scrb.playback.volume';
export const MUTED_KEY = 'scrb.playback.muted';

/** The speeds the player steps through, from slowest to fastest. */
export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export const rateLabel = (rate: number): string => `${rate}x`;

/** The next speed after `rate`; after the fastest it wraps to the slowest. */
export function nextRate(rate: number): number {
  const index = PLAYBACK_RATES.findIndex((step) => step === rate);
  return PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length] as number;
}

export function storedVolume(): number {
  const value = readStored<number>(VOLUME_KEY);
  return typeof value === 'number' && value >= 0 && value <= 1 ? value : 1;
}

/** The app's own playback level as the player last stored it. Silent at zero volume too. */
export function readPlaybackLevel(): { volume: number; muted: boolean } {
  const volume = storedVolume();
  return { volume, muted: readStored<boolean>(MUTED_KEY) === true || volume === 0 };
}
