import { readApps, readMics, type HelperApp, type OpenCommand } from '@scrb/capture';
import {
  ContractError,
  WHOLE_COMPUTER_SOURCE_ID,
  type InputDevice,
  type MeetingApp,
  type SourceSelection,
} from '@scrb/contracts';

const BROWSERS: ReadonlySet<string> = new Set([
  'com.apple.Safari',
  'com.brave.Browser',
  'com.google.Chrome',
  'com.microsoft.edgemac',
  'com.operasoftware.Opera',
  'com.vivaldi.Vivaldi',
  'company.thebrowser.Browser',
  'org.mozilla.firefox',
]);

const WHOLE_COMPUTER: MeetingApp = {
  id: WHOLE_COMPUTER_SOURCE_ID,
  name: 'Whole computer audio',
  kind: 'wholeComputer',
  isRunning: true,
};

/**
 * An empty list means whole-computer audio to the helper, so an app with no processes sends this
 * instead. It matches no process: the meeting track fails to open and the mic still records.
 */
const NO_PROCESS = [-1];

async function reading<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch {
    throw new ContractError({ code: 'internal', message: 'Audio sources could not be read.' });
  }
}

export function listInputDevices(helper: string): Promise<InputDevice[]> {
  return reading(() => readMics(helper));
}

/** A saved app stays listed while it is closed; the UI would otherwise show another source. */
export async function listMeetingApps(helper: string, savedAppId: string): Promise<MeetingApp[]> {
  const saved = savedAppId === WHOLE_COMPUTER_SOURCE_ID ? [] : [savedAppId];
  const apps = await reading(() => readApps(helper, saved));
  const rows = apps.map(toMeetingApp);
  for (const id of saved) {
    if (!rows.some((row) => row.id === id)) {
      rows.push({ id, name: id, kind: BROWSERS.has(id) ? 'browser' : 'app', isRunning: false });
    }
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return [...rows, WHOLE_COMPUTER];
}

function toMeetingApp(app: HelperApp): MeetingApp {
  return {
    id: app.bundleId,
    name: app.name,
    kind: BROWSERS.has(app.bundleId) ? 'browser' : 'app',
    isRunning: app.running,
  };
}

export interface ResolvedSources extends Pick<OpenCommand, 'source' | 'mic'> {
  /** The picked mic is gone, so `mic` is the system default. */
  micFellBack: boolean;
}

/** Turns the saved choice into what `open` takes. Process IDs are read fresh for every Start. */
export async function resolveSources(
  helper: string,
  { micDeviceId, meetingAppId }: SourceSelection,
): Promise<ResolvedSources> {
  const pids =
    meetingAppId === WHOLE_COMPUTER_SOURCE_ID
      ? null
      : await reading(async () => {
          const apps = await readApps(helper);
          return apps.find((app) => app.bundleId === meetingAppId)?.pids ?? [];
        });
  const micFellBack =
    micDeviceId !== null &&
    !(await reading(() => readMics(helper))).some((device) => device.id === micDeviceId);
  return {
    source: pids === null ? 'wholeComputer' : pids.length > 0 ? pids : NO_PROCESS,
    mic: micDeviceId === null || micFellBack ? 'default' : micDeviceId,
    micFellBack,
  };
}
