// @vitest-environment node
import { mkdtemp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ImportCoordinator } from './imports.ts';
import type { ImportResult } from '@scrb/app-core';
import type { Library } from '@scrb/storage';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'scrb-import-integration-'));
  const selected = join(root, 'invented.wav');
  await writeFile(selected, 'invented audio bytes');
  const emit = vi.fn();
  const applied = vi.fn(async () => undefined);
  const discard = vi.fn(async () => ({ meetingId: 'imported-1', ok: true, remaining: [] }));
  const update = vi.fn(async () => undefined);
  const library = {
    paths: { root, cache: join(root, 'cache') },
    createMeeting: vi.fn(async () => ({ id: 'imported-1' })),
    meetingPaths: () => ({ audioMeeting: join(root, 'completed-audio') }),
    applyFinalPass: applied,
    updateMeeting: update,
    discardImport: discard,
    vocabulary: { enabledTerms: vi.fn(() => [
      { term: 'Rosmont', enabled: true },
      { term: 'Quillon', enabled: false },
    ]) },
    logger: { log: vi.fn() },
  } as unknown as Library;
  const run = vi.fn(
    async ({
      meetingDir,
      signal,
    }: {
      meetingDir: string;
      signal: AbortSignal;
    }): Promise<ImportResult> => {
      if (signal.aborted) throw new Error('cancelled');
      await mkdir(join(meetingDir, 'audio', 'meeting'), { recursive: true });
      await writeFile(join(meetingDir, 'audio', 'meeting', 'chunks.json'), '{"version":1}');
      return {
        meetingDir,
        sourceName: 'invented.wav',
        fileDate: new Date('2026-10-31T00:00:00Z'),
        durationMs: 1000,
        truncated: false,
        chunks: [],
        transcript: {
          version: 1,
          durationMs: 1000,
          words: [],
          turns: [],
          speakers: [],
          spans: [],
          models: { speech: 'synthetic', segmentation: 'synthetic', embedding: 'synthetic' },
          timing: { transcribeMs: 1, diarizeMs: 1 },
        },
      };
    },
  );
  const deps = {
    library,
    chooseFile: vi.fn(async () => selected),
    run,
    recordingBusy: vi.fn(() => false),
    privacyBanner: vi.fn(async () => false),
    emit,
    removeStaging: undefined as ((folder: string) => Promise<void>) | undefined,
  };
  const coordinator = new ImportCoordinator(deps);
  return { root, selected, emit, run, library, coordinator, deps, applied, discard, update };
}

describe('Electron import coordination', () => {
  it('continues startup cleanup after a removal failure and logs no private path', async () => {
    const f = await fixture();
    const dir = join(f.root, 'cache', 'imports');
    const blocked = '81790608-4aee-4b84-98fc-a2fcd33a7590';
    const cleaned = 'd3ac27bc-7b2f-4003-814d-4534b28a6312';
    await mkdir(join(dir, blocked), { recursive: true });
    await mkdir(join(dir, cleaned), { recursive: true });
    const removeStaging = vi.fn(async (folder: string) => {
      if (folder.endsWith(blocked)) {
        throw Object.assign(new Error('private path: ' + folder), { code: 'EACCES' });
      }
      await (await import('node:fs/promises')).rm(folder, { recursive: true, force: true });
    });
    f.deps.removeStaging = removeStaging;
    await expect(f.coordinator.recoverInterrupted()).resolves.toBeUndefined();
    expect(await readdir(dir)).toEqual([blocked]);
    expect(f.library.logger.log).toHaveBeenCalledWith(
      'warn', 'import-recovery-cleanup-failed',
      expect.objectContaining({ error: 'Error', code: 'EACCES' }),
    );
    expect(JSON.stringify(vi.mocked(f.library.logger.log).mock.calls)).not.toContain(f.root);
  });


  it('removes only interrupted app-owned import staging directories, retaining unrelated files', async () => {
    const f = await fixture();
    const stageRoot = join(f.root, 'cache', 'imports');
    const orphan = '81790608-4aee-4b84-98fc-a2fcd33a7590';
    await mkdir(join(stageRoot, orphan), { recursive: true });
    await writeFile(join(stageRoot, orphan, 'private-staged.txt'), 'synthetic data');
    await mkdir(join(stageRoot, 'owner-folder'), { recursive: true });
    await f.coordinator.recoverInterrupted();
    expect(await readdir(stageRoot)).toEqual(['owner-folder']);
    await f.coordinator.shutdown();
  });

  it('keeps chosen paths private, consumes file tokens once, and publishes a completed meeting', async () => {
    const f = await fixture();
    const file = (await f.coordinator.handlers.pickAudioFile!(undefined)) as {
      fileToken: string;
      fileName: string;
      sizeBytes: number;
      fileDate: string;
    };
    expect(file).toMatchObject({ fileName: 'invented.wav' });
    expect(JSON.stringify(file)).not.toContain(f.root);
    const { importId } = (await f.coordinator.handlers.importAudioFile!({
      fileToken: file.fileToken,
      buildVoiceProfiles: false,
    })) as { importId: string };
    await vi.waitFor(() => {
      expect(f.emit).toHaveBeenCalledWith('importFinished', { importId, meetingId: 'imported-1' });
    });
    expect(f.applied).toHaveBeenCalledTimes(1);
    expect(f.run).toHaveBeenCalledWith(expect.objectContaining({ vocabularyHint: 'Rosmont' }));
    expect(f.update).toHaveBeenCalledWith('imported-1', { status: 'ready' });
    await expect(
      f.coordinator.handlers.importAudioFile!({
        fileToken: file.fileToken,
        buildVoiceProfiles: false,
      }),
    ).rejects.toMatchObject({ code: 'notFound' });
    expect(f.coordinator.list()).toEqual([]);
    await f.coordinator.shutdown();
  });

  it('cancels running imports, emits one terminal cancellation and never creates a meeting', async () => {
    const f = await fixture();
    f.deps.run.mockImplementation(
      async ({ signal }: { meetingDir: string; signal: AbortSignal }) => {
        if (signal.aborted) throw new Error('aborted');
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
        throw new Error('unreachable');
      },
    );
    const file = (await f.coordinator.handlers.pickAudioFile!(undefined)) as { fileToken: string };
    const { importId } = (await f.coordinator.handlers.importAudioFile!({
      fileToken: file.fileToken,
      buildVoiceProfiles: false,
    })) as { importId: string };
    await f.coordinator.handlers.cancelImport!({ importId });
    expect(f.emit).toHaveBeenCalledWith('importCancelled', {
      importId,
      fileName: 'invented.wav',
    });
    expect(f.deps.library.createMeeting).not.toHaveBeenCalled();
    await f.coordinator.handlers.cancelImport!({ importId });
    await f.coordinator.shutdown();
  });

  it('a recording preempts an import and reports the recording rather than user cancellation', async () => {
    const f = await fixture();
    f.deps.run.mockImplementation(
      async ({ signal }: { meetingDir: string; signal: AbortSignal }) => {
        if (signal.aborted) throw new Error('aborted');
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
        throw new Error('unreachable');
      },
    );
    const file = (await f.coordinator.handlers.pickAudioFile!(undefined)) as { fileToken: string };
    const { importId } = (await f.coordinator.handlers.importAudioFile!({
      fileToken: file.fileToken,
      buildVoiceProfiles: false,
    })) as { importId: string };
    await f.coordinator.stopForRecording();
    expect(f.emit).toHaveBeenCalledWith(
      'importFailed',
      expect.objectContaining({
        importId,
        reason: 'recordingInProgress',
      }),
    );
    expect(f.deps.library.createMeeting).not.toHaveBeenCalled();
    await f.coordinator.shutdown();
  });
});
