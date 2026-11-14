import { useEffect, useState } from 'react';

// Where the user left off in each tab, for this session only. A screen is torn down when another
// tab opens, so what it should come back to lives here.
const memory = new Map<string, unknown>();

export function recall<T>(key: string): T | undefined {
  return memory.get(key) as T | undefined;
}

export function remember(key: string, value: unknown): void {
  memory.set(key, value);
}

export function forgetAllTabMemory(): void {
  memory.clear();
}

/** Like `useState`, but a screen that opens again starts from the value it last had. */
export function useRemembered<T>(key: string, initial: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => recall<T>(key) ?? initial);
  useEffect(() => remember(key, value), [key, value]);
  return [value, setValue];
}
