import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinalTranscript } from '@scrb/transcription';
import {
  createConfiguredImportRunner,
  createFinalPassRunner,
  FinalPassUnavailableError,
} from './final-pass.ts';

const { runFinalPassMock, importAudioFileMock } = vi.hoisted(() => ({
  runFinalPassMock: vi.fn(),
  importAudioFileMock: vi.fn(),
}));

vi.mock('@scrb/transcription', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@scrb/transcription')>();
  return {
    ...actual,
    importAudioFile: importAudioFileMock,
    runFinalPass: runFinalPassMock,
  };
});

const TRANSCRIPT: FinalTranscript = {
  version: 1,
  durationMs: 0,
  words: [],
  turns: [],
  speakers: [],
  spans: [],
  models: { speech: 'speech', segmentation: 'segmentation', embedding: 'embedding' },
  timing: { transcribeMs: 0, diarizeMs: 0 },
};

const OMIT = Symbol('omit whisper config');

describe('configured final-pass Whisper options', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'scrb-final-pass-config-'));
    runFinalPassMock.mockReset().mockResolvedValue(TRANSCRIPT);
    importAudioFileMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const writeConfig = (whisper: unknown | typeof OMIT = OMIT): string => {
    const tool = (name: string): string => {
      const path = join(root, name);
      writeFileSync(path, '#!/bin/sh\nexit 0\n');
      chmodSync(path, 0o755);
      return path;
    };
    const model = join(root, 'model');
    writeFileSync(model, 'model fixture');
    const configPath = join(root, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        tools: {
          ffmpeg: tool('ffmpeg'),
          ffprobe: tool('ffprobe'),
          whisperCli: tool('whisper-cli'),
          sherpaSidecar: tool('scrb-sherpa'),
        },
        models: { speechFinal: model, vad: model, segmentation: model, embedding: model },
        ...(whisper === OMIT ? {} : { whisper }),
      }),
    );
    return configPath;
  };

  const runInput = () => ({
    tracks: [],
    workDir: join(root, 'scratch'),
    signal: new AbortController().signal,
  });

  it('keeps the legacy GPU default when the whisper setting is omitted', async () => {
    const runner = createFinalPassRunner(writeConfig());
    await runner(runInput());

    expect(runFinalPassMock).toHaveBeenCalledTimes(1);
    const options = runFinalPassMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options).not.toHaveProperty('useGpu');
  });

  it('keeps the GPU default when whisper is present without useGpu', async () => {
    const runner = createFinalPassRunner(writeConfig({}));
    await runner(runInput());

    const options = runFinalPassMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options).not.toHaveProperty('useGpu');
  });

  it('forwards an explicit true GPU setting', async () => {
    const runner = createFinalPassRunner(writeConfig({ useGpu: true }));
    await runner(runInput());

    expect(runFinalPassMock).toHaveBeenCalledWith(expect.objectContaining({ useGpu: true }));
  });

  it('forwards false to enable Whisper CPU mode', async () => {
    const runner = createFinalPassRunner(writeConfig({ useGpu: false }));
    await runner(runInput());

    expect(runFinalPassMock).toHaveBeenCalledWith(expect.objectContaining({ useGpu: false }));
  });

  it.each([
    ['null', null],
    ['string', 'false'],
    ['number', 0],
    ['array', []],
    ['object', {}],
  ])('rejects a %s whisper.useGpu value clearly', async (_name, useGpu) => {
    const runner = createFinalPassRunner(writeConfig({ useGpu }));

    await expect(runner(runInput())).rejects.toThrow(
      new FinalPassUnavailableError('config whisper.useGpu must be a boolean'),
    );
    expect(runFinalPassMock).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['string', 'cpu'],
    ['number', 1],
    ['boolean', false],
    ['array', []],
  ])('rejects a %s whisper container clearly', async (_name, whisper) => {
    const runner = createFinalPassRunner(writeConfig(whisper));

    await expect(runner(runInput())).rejects.toThrow(
      new FinalPassUnavailableError('config whisper must be an object'),
    );
    expect(runFinalPassMock).not.toHaveBeenCalled();
  });

  it('does not validate or forward the final-pass-only setting in the import runner', async () => {
    const runner = createConfiguredImportRunner(writeConfig({ useGpu: 'invalid' }));
    await runner({
      sourcePath: join(root, 'source.wav'),
      meetingDir: join(root, 'meeting'),
      signal: new AbortController().signal,
      onProgress: () => undefined,
    });

    expect(importAudioFileMock).toHaveBeenCalledTimes(1);
    expect(runFinalPassMock).not.toHaveBeenCalled();
  });
});
