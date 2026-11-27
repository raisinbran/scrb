import { useSyncExternalStore } from 'react';
import { readStored, writeStored } from './stored-value.ts';

/** Banner categories a person can turn off. Errors and anything about recording or data safety are not here on purpose. */
export const NOTIFICATION_CATEGORIES = [
  {
    id: 'tips',
    label: 'Transcript tips and hints',
    description: 'How to correct words and rename speakers.',
  },
  {
    id: 'summary',
    label: 'Summary outdated or re-processed',
    description: 'When a summary no longer matches its transcript.',
  },
  {
    id: 'paused',
    label: 'Paused-audio notices',
    description: 'Which stretch of a meeting was paused and left out.',
  },
  {
    id: 'privacy',
    label: 'Recording consent and privacy reminder',
    description: 'The voice-profile reminder when a recording starts.',
  },
  {
    id: 'progress',
    label: 'Processing progress',
    description: 'The banner shown while a final transcript is processing.',
  },
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]['id'];

const KEY = 'scrb.notifications';
interface Stored {
  off?: NotificationCategory[];
  taught?: boolean;
}

let off = new Set<NotificationCategory>(readStored<Stored>(KEY)?.off ?? []);
let taught = readStored<Stored>(KEY)?.taught === true;
let teaching = false;
let hosts = 0;
let version = 0;
const listeners = new Set<() => void>();

const publish = () => {
  version += 1;
  writeStored(KEY, { off: [...off], taught } satisfies Stored);
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export function useNotificationEnabled(category: NotificationCategory): boolean {
  useSyncExternalStore(subscribe, () => version);
  return !off.has(category);
}

export function setNotificationEnabled(category: NotificationCategory, enabled: boolean): void {
  off = new Set(off);
  if (enabled) off.delete(category);
  else off.add(category);
  publish();
}

/** Call when a person dismisses an optional banner. The first time, it opens the one-time pointer to Settings. */
export function noteOptionalDismiss(): void {
  // With no pointer mounted the dismissal would be shown later, out of context, so it does not count.
  if (taught || hosts === 0) return;
  teaching = true;
  version += 1;
  listeners.forEach((listener) => listener());
}

/** Closing the pointer, by any route, is what counts as taught: a dismissal with no pointer shown is not lost. */
/** A mounted pointer registers here, so a dismissal only counts when someone can see the pointer. */
export function registerTeachingHost(): () => void {
  hosts += 1;
  return () => {
    hosts -= 1;
  };
}

export function closeTeaching(): void {
  if (!teaching) return;
  teaching = false;
  taught = true;
  publish();
}

export function useTeachingOpen(): boolean {
  useSyncExternalStore(subscribe, () => version);
  return teaching;
}

/** For tests: forget everything this module holds. */
export function resetNotificationPrefs(): void {
  off = new Set();
  taught = false;
  teaching = false;
  publish();
}
