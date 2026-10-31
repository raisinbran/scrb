// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { listMeetingApps } from './sources.ts';

vi.mock('@scrb/capture', () => ({
  readMics: vi.fn(),
  readApps: vi.fn(async () => [
    { bundleId: 'msedge.exe', name: 'Microsoft Edge', running: true, pids: [50] },
    { bundleId: 'Teams.exe', name: 'Microsoft Teams', running: true, pids: [60] },
  ]),
}));

describe('Windows source picker', () => {
  it('treats an exe file name from the Windows helper as a browser', async () => {
    const apps = await listMeetingApps('helper', 'chrome.exe');
    expect(apps.map((app) => [app.id, app.kind])).toEqual([
      ['chrome.exe', 'browser'],
      ['msedge.exe', 'browser'],
      ['Teams.exe', 'app'],
      ['whole-computer', 'wholeComputer'],
    ]);
  });
});
