import type { TranscriptionQuality } from '@scrb/contracts';

export interface Hardware {
  cores: number;
  memoryBytes: number;
}

export interface PerformancePlan {
  /** False means live text is off and the words appear after Stop. */
  live: boolean;
  liveThreads: number;
  finalThreads: number;
}

const GIB = 1024 ** 3;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.trunc(n)));

/** Thread counts are whole numbers inside 2 to 8, so the live-config loader's 1 to 64 range holds. */
export function resolvePerformance(quality: TranscriptionQuality, hw: Hardware): PerformancePlan {
  const cores = Number.isFinite(hw.cores) && hw.cores >= 1 ? Math.floor(hw.cores) : 1;
  switch (quality) {
    case 'fast':
      return { live: false, liveThreads: 2, finalThreads: clamp(Math.floor(cores / 4), 2, 8) };
    case 'balanced':
      return { live: true, liveThreads: clamp(Math.floor(cores / 2), 2, 4), finalThreads: 4 };
    case 'accurate':
      return {
        live: true,
        liveThreads: clamp(cores - 2, 2, 8),
        finalThreads: clamp(cores - 2, 2, 8),
      };
  }
}

/** A fixed rule, no timing. Best quality is never the recommendation. */
export function recommendQuality(hw: Hardware): TranscriptionQuality {
  return hw.memoryBytes < 8 * GIB || hw.cores < 4 ? 'fast' : 'balanced';
}
