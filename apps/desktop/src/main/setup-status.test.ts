// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSettingsHandlers } from '@scrb/app-core';
import { Library } from '@scrb/storage';
import { createSetupStatusHandler } from './setup-status.ts';

describe('getSetupStatus', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'scrb-setup-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const open = async () => {
    const library = await Library.open({ root: join(dir, 'library') });
    const settings = createSettingsHandlers(library.settings, join(dir, 'library'));
    return { library, settings, status: createSetupStatusHandler(settings.getSettings) };
  };

  it('reports the saved location after the library is reopened from disk', async () => {
    const first = await open();
    expect((await first.status()).locationSet).toBe(false);
    first.settings.updateSettings({ location: { country: 'US', usState: 'IL' } });
    await first.library.close();

    const second = await open();
    expect((await second.status()).locationSet).toBe(true);
    expect(second.settings.getSettings().location).toEqual({ country: 'US', usState: 'IL' });
    await second.library.close();
  });

  it('does not invent models or permissions', async () => {
    const { library, status } = await open();
    expect(await status()).toMatchObject({
      models: [],
      permissions: { microphone: 'unknown', meetingAudio: 'unknown' },
      complete: false,
    });
    await library.close();
  });
});
