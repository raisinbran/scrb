// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { listMeetingApps, resolveSources } from './sources.ts';

vi.mock('@scrb/capture', () => ({
  readMics: vi.fn(),
  readApps: vi.fn(async () => [
    { bundleId: 'msedge.exe', name: 'Microsoft Edge', running: true, pids: [50] },
    { bundleId: 'Teams.exe', name: 'Microsoft Teams', running: true, pids: [60] },
    { bundleId: 'ms-teams.exe', name: 'Microsoft Teams', running: true, pids: [70] },
  ]),
}));

describe('Windows source picker', () => {
  it('treats an exe file name from the Windows helper as a browser', async () => {
    const apps = await listMeetingApps('helper', 'chrome.exe');
    expect(apps.map((app) => [app.id, app.kind])).toEqual([
      ['chrome.exe', 'browser'],
      ['msedge.exe', 'browser'],
      ['Teams.exe', 'app'],
      ['ms-teams.exe', 'app'],
      ['whole-computer', 'wholeComputer'],
    ]);
  });

  it('says that new Teams records its whole output device', async () => {
    const apps = await listMeetingApps('helper', 'whole-computer');
    expect(apps.find((app) => app.id === 'ms-teams.exe')?.name).toBe(
      'Microsoft Teams (records all sound on its output device)',
    );
  });

  it('follows the output device of new Teams and keeps per-app capture for others', async () => {
    const selection = { micDeviceId: null };
    const teams = await resolveSources('helper', { ...selection, meetingAppId: 'ms-teams.exe' });
    expect(teams).toMatchObject({ source: [70], followApp: 'ms-teams.exe' });
    const edge = await resolveSources('helper', { ...selection, meetingAppId: 'msedge.exe' });
    expect(edge).not.toHaveProperty('followApp');
    const whole = await resolveSources('helper', { ...selection, meetingAppId: 'whole-computer' });
    expect(whole).not.toHaveProperty('followApp');
  });
});
