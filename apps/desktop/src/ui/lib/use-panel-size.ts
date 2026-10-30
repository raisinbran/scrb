import { useCallback, useState } from 'react';
import { readStored, writeStored } from './stored-value.ts';

export interface PanelLimits {
  min: number;
  max: number;
  initial: number;
}

export function clampSize(size: number, { min, max }: PanelLimits): number {
  return Math.min(max, Math.max(min, size));
}

/** A panel width remembered across launches. */
export function usePanelSize(key: string, limits: PanelLimits) {
  const [size, setSizeState] = useState(() =>
    clampSize(readStored<number>(key) ?? limits.initial, limits),
  );
  const setSize = useCallback(
    (next: number) => {
      const clamped = clampSize(next, limits);
      setSizeState(clamped);
      writeStored(key, clamped);
    },
    [key, limits],
  );
  return [size, setSize] as const;
}
