// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSettingsHandlers } from '@scrb/app-core';
import { Library } from '@scrb/storage';
import { createSetupStatusHandler, microphoneState } from './setup-status.ts';

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
    return {
      library,
      settings,
      status: createSetupStatusHandler({ readSettings: settings.getSettings }),
    };
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

  it('reports nothing installed and unknown permissions when nothing is configured', async () => {
    const { library, status } = await open();
    expect(await status()).toMatchObject({
      models: [],
      permissions: { microphone: 'unknown', meetingAudio: 'unknown' },
      complete: false,
    });
    await library.close();
  });

  describe('with configured files', () => {
    const files = async (missing: string[] = []) => {
      const make = async (name: string) => {
        const path = join(dir, name);
        if (!missing.includes(name)) await writeFile(path, 'xx');
        return path;
      };
      const names = [
        'helper',
        'ffmpeg',
        'ffprobe',
        'whisper-cli',
        'sherpa',
        'vad',
        'ggml-large-v3-turbo.bin',
        'seg',
        'emb',
      ];
      const p = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await make(n)])));
      const config = join(dir, 'final.json');
      await writeFile(
        config,
        JSON.stringify({
          tools: {
            ffmpeg: p['ffmpeg'],
            ffprobe: p['ffprobe'],
            whisperCli: p['whisper-cli'],
            sherpaSidecar: p['sherpa'],
          },
          models: {
            speechFinal: p['ggml-large-v3-turbo.bin'],
            vad: p['vad'],
            segmentation: p['seg'],
            embedding: p['emb'],
          },
        }),
      );
      return { helper: p['helper'], config };
    };
    const run = async (
      f: { helper: string | undefined; config: string },
      mic: () => string,
      location = true,
    ) => {
      const { library, settings } = await open();
      if (location) settings.updateSettings({ location: { country: 'US', usState: 'IL' } });
      const status = await createSetupStatusHandler({
        readSettings: settings.getSettings,
        helper: f.helper,
        finalPassConfig: f.config,
        microphoneStatus: mic,
      })();
      await library.close();
      return status;
    };

    it('is complete when files exist, the microphone is granted and a location is saved', async () => {
      const status = await run(await files(), () => 'granted');
      expect(status.models).toEqual([
        {
          role: 'finalSpeech',
          name: 'ggml-large-v3-turbo.bin',
          version: 'local',
          installed: true,
          sizeBytes: 2,
        },
        {
          role: 'speaker',
          name: 'Segmentation and embedding',
          version: 'local',
          installed: true,
          sizeBytes: 4,
        },
      ]);
      expect(status.permissions).toEqual({ microphone: 'granted', meetingAudio: 'unknown' });
      expect(status.complete).toBe(true);
    });

    it('marks a missing model not installed and incomplete', async () => {
      const status = await run(await files(['emb']), () => 'granted');
      expect(status.models.find((m) => m.role === 'speaker')).toMatchObject({
        installed: false,
        sizeBytes: 0,
      });
      expect(status.complete).toBe(false);
    });

    it.each([['ffmpeg'], ['ffprobe'], ['helper'], ['vad']])(
      'is incomplete when %s is missing',
      async (name) => {
        const f = await files([name]);
        expect((await run(f, () => 'granted')).complete).toBe(false);
      },
    );

    it('is incomplete without microphone permission or location', async () => {
      const f = await files();
      expect((await run(f, () => 'granted', false)).complete).toBe(false);
      expect((await run(f, () => 'denied')).complete).toBe(false);
    });

    it('lists the live model only when a live config is given', async () => {
      const f = await files();
      const live = join(dir, 'live.json');
      const speech = join(dir, 'live.bin');
      await writeFile(speech, 'x');
      await writeFile(live, JSON.stringify({ tools: {}, models: { speechLive: speech } }));
      const { library, settings } = await open();
      const status = await createSetupStatusHandler({
        readSettings: settings.getSettings,
        helper: f.helper,
        finalPassConfig: f.config,
        liveConfig: live,
      })();
      await library.close();
      expect(status.models.map((m) => m.role)).toEqual(['liveSpeech', 'finalSpeech', 'speaker']);
      expect(status.complete).toBe(false);
    });

    it('treats an unreadable config as nothing installed', async () => {
      const { library, settings } = await open();
      const status = await createSetupStatusHandler({
        readSettings: settings.getSettings,
        finalPassConfig: join(dir, 'nope.json'),
      })();
      await library.close();
      expect(status.models.every((m) => !m.installed)).toBe(true);
      expect(status.complete).toBe(false);
    });
  });

  it('maps Electron microphone states honestly', () => {
    expect(microphoneState(() => 'granted')).toBe('granted');
    expect(microphoneState(() => 'not-determined')).toBe('notDetermined');
    expect(microphoneState(() => 'denied')).toBe('denied');
    expect(microphoneState(() => 'restricted')).toBe('denied');
    expect(microphoneState(() => 'weird')).toBe('unknown');
    expect(
      microphoneState(() => {
        throw new Error('x');
      }),
    ).toBe('unknown');
    expect(microphoneState(undefined)).toBe('unknown');
  });
});
