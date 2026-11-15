import type { Backend, InputDevice, MeetingApp } from '@scrb/contracts';

export interface Sources {
  devices: InputDevice[];
  apps: MeetingApp[];
}

let cached: Sources | null = null;
// Each request takes a number; an answer older than the newest one already stored is dropped, so a
// slow early request can never overwrite a newer device list.
let requested = 0;
let stored = 0;

/** Asks the backend for the lists (the slow part of opening Settings and Live) and remembers them. */
export async function fetchSources(backend: Backend): Promise<Sources> {
  const ticket = ++requested;
  const [devices, apps] = await Promise.all([
    backend.call('listInputDevices'),
    backend.call('listMeetingApps'),
  ]);
  if (ticket > stored) {
    stored = ticket;
    cached = { devices, apps };
  }
  return cached ?? { devices, apps };
}

/** The last lists seen, if any, so a screen can draw at once. */
export function cachedSources(): Sources | null {
  return cached;
}

/** The last lists if there are any, so a screen can draw at once; otherwise waits for them. The caller refreshes them behind the screen with `fetchSources`. */
export function sourcesNow(backend: Backend): Promise<Sources> {
  return cached ? Promise.resolve(cached) : fetchSources(backend);
}

/** A device was plugged in or removed: the remembered lists can no longer be trusted. */
export function forgetSources(): void {
  cached = null;
  // Answers to requests made before this point describe the old devices.
  stored = requested;
}
