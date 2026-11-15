import type { Backend, InputDevice, MeetingApp } from '@scrb/contracts';

export interface Sources {
  devices: InputDevice[];
  apps: MeetingApp[];
}

let cached: Sources | null = null;

/** Asks the backend for the lists (the slow part of opening Settings and Live) and remembers them. */
export async function fetchSources(backend: Backend): Promise<Sources> {
  const [devices, apps] = await Promise.all([
    backend.call('listInputDevices'),
    backend.call('listMeetingApps'),
  ]);
  cached = { devices, apps };
  return cached;
}

/** The last lists seen, if any, so a screen can draw at once. */
export function cachedSources(): Sources | null {
  return cached;
}

/** Use the last lists if there are any and refresh them behind the screen; otherwise wait for them. */
export function sourcesNow(backend: Backend): Promise<Sources> {
  if (!cached) return fetchSources(backend);
  void fetchSources(backend).catch(() => undefined);
  return Promise.resolve(cached);
}

/** A device was plugged in or removed: the remembered lists can no longer be trusted. */
export function forgetSources(): void {
  cached = null;
}
