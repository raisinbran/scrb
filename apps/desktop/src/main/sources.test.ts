// @vitest-environment node
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { SourceSelection } from '@scrb/contracts';
import type { Library } from '@scrb/storage';
import { RecordingController, type SourceStore } from './recording.ts';
import { listInputDevices, listMeetingApps, resolveSources } from './sources.ts';

const ZOOM = { bundleId: 'us.zoom.xos', name: 'Zoom', running: true, pids: [40, 41, 42] };
const CHROME = { bundleId: 'com.google.Chrome', name: 'Chrome', running: true, pids: [50] };
const MIC = { id: 'uid-usb', name: 'USB Mic', isSystemDefault: false, transport: 'usb' };
const WHOLE = 'whole-computer';

/** Stands in for scrb-capture and writes each `open` it receives to a file. */
function helper(apps: unknown[] = [ZOOM, CHROME], acks = 'activeTracks: ["microphone"]') {
  const folder = mkdtempSync(join(tmpdir(), 'scrb-helper-'));
  const path = join(folder, 'helper.cjs');
  const opened = join(folder, 'opened.jsonl');
  writeFileSync(
    path,
    `#!/usr/bin/env node
if (process.argv[2] === 'check-lock') process.exit(0);
const fs = require('node:fs');
require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => {
  const command = JSON.parse(line);
  if (command.name === 'open') fs.appendFileSync(${JSON.stringify(opened)}, line + '\\n');
  const reply = { type: 'ack', id: command.id, ok: true, gate: 'open', atNs: 0, ${acks} };
  if (command.name === 'listMics') reply.mics = [${JSON.stringify(MIC)}];
  if (command.name === 'listApps') {
    const known = ${JSON.stringify(apps)};
    const extra = command.include
      .filter((bundleId) => bundleId === 'installed.app')
      .map((bundleId) => ({ bundleId, name: 'Installed', running: false, pids: [] }));
    reply.apps = [...known, ...extra];
  }
  console.log(JSON.stringify(reply));
  if (command.name === 'stop') process.exit(0);
});
`,
  );
  chmodSync(path, 0o755);
  return { path, opens: () => readFileSync(opened, 'utf8').trim().split('\n').map(parse) };
}

function deadHelper(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'scrb-helper-')), 'helper.cjs');
  writeFileSync(path, '#!/usr/bin/env node\nprocess.exit(1);\n');
  chmodSync(path, 0o755);
  return path;
}

function parse(line: string): { source: unknown; mic: string } {
  return JSON.parse(line) as { source: unknown; mic: string };
}

function store(meetingAppId: string, micDeviceId: string | null = null): SourceStore {
  let selection: SourceSelection = { meetingAppId, micDeviceId };
  return {
    read: () => selection,
    save: (next) => {
      selection = next;
    },
  };
}

function controller(path: string, sources: SourceStore, emit = vi.fn()) {
  const folder = mkdtempSync(join(tmpdir(), 'scrb-meeting-'));
  const library = {
    createMeeting: vi.fn(async () => ({ id: 'm1' })),
    updateMeeting: vi.fn(async () => undefined),
    meetingPaths: () => ({ audio: join(folder, 'audio') }),
  };
  const recording = new RecordingController(library as unknown as Library, path, emit, sources);
  return { handlers: recording.handlers, library, emit };
}

describe.skipIf(process.platform === 'win32')('source pickers', () => {
  it('lists mics as the helper reports them', async () => {
    expect(await listInputDevices(helper().path)).toEqual([MIC]);
  });

  it('uses the bundle ID as the app ID and always offers whole computer last', async () => {
    const apps = await listMeetingApps(helper().path, WHOLE);
    expect(apps.map((app) => [app.id, app.kind, app.isRunning])).toEqual([
      ['com.google.Chrome', 'browser', true],
      ['us.zoom.xos', 'app', true],
      [WHOLE, 'wholeComputer', true],
    ]);
  });

  it('offers whole computer even when no app has audio', async () => {
    const apps = await listMeetingApps(helper([]).path, WHOLE);
    expect(apps.map((app) => app.id)).toEqual([WHOLE]);
  });

  it('keeps a saved app listed as not running', async () => {
    const { path } = helper([]);
    const named = await listMeetingApps(path, 'installed.app');
    expect(named[0]).toMatchObject({ name: 'Installed', isRunning: false });
    const unnamed = await listMeetingApps(path, 'gone.app');
    expect(unnamed[0]).toMatchObject({ id: 'gone.app', name: 'gone.app', isRunning: false });
  });

  it('reports a helper that cannot list as an error, not an empty list', async () => {
    await expect(listInputDevices(deadHelper())).rejects.toMatchObject({ code: 'internal' });
  });

  it('resolves an app to all its processes', async () => {
    const resolved = await resolveSources(helper().path, {
      meetingAppId: 'us.zoom.xos',
      micDeviceId: null,
    });
    expect(resolved).toEqual({ source: [40, 41, 42], mic: 'default', micFellBack: false });
  });

  it.each([
    ['is not listed', []],
    ['has no processes', [{ ...ZOOM, pids: [], running: false }]],
  ])('never widens to whole computer when the app %s', async (_, apps) => {
    const { source } = await resolveSources(helper(apps).path, {
      meetingAppId: 'us.zoom.xos',
      micDeviceId: null,
    });
    expect(source).toEqual([-1]);
  });

  it('falls back to the default mic only when the picked one is gone', async () => {
    const { path } = helper();
    const kept = await resolveSources(path, { meetingAppId: WHOLE, micDeviceId: MIC.id });
    expect(kept).toEqual({ source: 'wholeComputer', mic: MIC.id, micFellBack: false });
    const gone = await resolveSources(path, { meetingAppId: WHOLE, micDeviceId: 'unplugged' });
    expect(gone).toEqual({ source: 'wholeComputer', mic: 'default', micFellBack: true });
  });
});

describe.skipIf(process.platform === 'win32')('recording with chosen sources', () => {
  const start = (handlers: ReturnType<typeof controller>['handlers']) =>
    handlers.startRecording?.({});

  it('opens the helper with the choice saved by selectSources', async () => {
    const fake = helper();
    const { handlers } = controller(fake.path, store(WHOLE));
    await handlers.selectSources?.({ meetingAppId: 'us.zoom.xos', micDeviceId: MIC.id });
    await start(handlers);
    expect(fake.opens()[0]).toMatchObject({ source: [40, 41, 42], mic: MIC.id });
    await handlers.stopRecording?.(undefined);
  });

  it('sends the empty list that means whole computer only when that was chosen', async () => {
    const fake = helper();
    const { handlers } = controller(fake.path, store(WHOLE));
    await start(handlers);
    expect(fake.opens()[0]).toMatchObject({ source: [], mic: 'default' });
    await handlers.stopRecording?.(undefined);
  });

  it('warns about a missing picked mic and still records', async () => {
    const fake = helper();
    const { handlers, emit } = controller(fake.path, store(WHOLE, 'unplugged'));
    await start(handlers);
    const warnings = emit.mock.calls.filter(([name]) => name === 'recordingHealth');
    expect(warnings[0]?.[1].warnings[0]).toMatchObject({ kind: 'deviceChanged' });
    await handlers.stopRecording?.(undefined);
  });

  it('refuses a source change during a recording and keeps the choice', async () => {
    const sources = store(WHOLE);
    const { handlers } = controller(helper().path, sources);
    await start(handlers);
    await expect(
      handlers.selectSources?.({ meetingAppId: 'us.zoom.xos', micDeviceId: null }),
    ).rejects.toMatchObject({ code: 'conflict' });
    await handlers.selectSources?.({ meetingAppId: WHOLE, micDeviceId: null });
    expect(sources.read().meetingAppId).toBe(WHOLE);
    await handlers.stopRecording?.(undefined);
  });

  it('allows another Start after a failed one', async () => {
    const fake = helper([ZOOM], 'activeTracks: []');
    const { handlers } = controller(fake.path, store(WHOLE));
    await expect(start(handlers)).rejects.toMatchObject({ code: 'internal' });
    await expect(start(handlers)).rejects.toMatchObject({ code: 'internal' });
    expect(fake.opens()).toHaveLength(2);
  });

  it.each([
    ['is refused', 'activeTracks: []'],
    [
      'crashes before the ack',
      '...(command.name === "start" ? process.exit(1) : {}), activeTracks: ["microphone"]',
    ],
  ])('closes the meeting row when the start %s', async (_, acks) => {
    const { handlers, library } = controller(helper([ZOOM], acks).path, store(WHOLE));
    await expect(start(handlers)).rejects.toMatchObject({ code: 'internal' });
    expect(library.updateMeeting).toHaveBeenCalledWith('m1', {
      status: 'recovered',
      durationMs: 0,
    });
  });

  it('creates no meeting when the sources cannot be read', async () => {
    const { handlers, library } = controller(deadHelper(), store('us.zoom.xos'));
    await expect(start(handlers)).rejects.toMatchObject({ code: 'internal' });
    expect(library.createMeeting).not.toHaveBeenCalled();
  });
});
