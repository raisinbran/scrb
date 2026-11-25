// @vitest-environment node
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ImportCoordinator } from './imports.ts';
import { createMeetingHandlers } from './meetings.ts';
import type { BackendEvents } from '@scrb/contracts';
import type { ImportResult } from '@scrb/app-core';
import { Library } from '@scrb/storage';
import { once, EventEmitter } from 'node:events';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'scrb-import-integration-'));
  const selected = join(root, 'invented.wav');
  await writeFile(selected, 'invented audio bytes');
  const emit = vi.fn();
  const applied = vi.fn(async (): Promise<void> => undefined);
  const discard = vi.fn(async () => ({
    meetingId: 'imported-1',
    ok: true,
    remaining: [] as string[],
  }));
  const update = vi.fn(async () => undefined);
  const library = {
    paths: { root, cache: join(root, 'cache') },
    createMeeting: vi.fn(async () => ({ id: 'imported-1' })),
    meetingPaths: () => ({ audioMeeting: join(root, 'completed-audio') }),
    applyFinalPass: applied,
    updateMeeting: update,
    discardImport: discard,
    vocabulary: {
      enabledTerms: vi.fn(() => [
        { term: 'Rosmont', enabled: true },
        { term: 'Quillon', enabled: false },
      ]),
    },
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
    beforeDelete: vi.fn<(meetingId: string) => void>(),
    removeStaging: undefined as ((folder: string) => Promise<void>) | undefined,
  };
  const coordinator = new ImportCoordinator(deps);
  return { root, selected, emit, run, library, coordinator, deps, applied, discard, update };
}

describe('Electron import coordination', () => {
  it.each(['wav', 'mp3', 'm4a', 'flac', 'opus'])(
    'saves a picked .%s as a single-source meeting with editable final words',
    async (extension) => {
      const f = await fixture();
      const library = await Library.open({ root: join(f.root, 'library') });
      const selected = join(f.root, `Invented source.${extension}`);
      const original = 'Invented source bytes';
      await writeFile(selected, original);
      const before = await stat(selected);
      const terminal = new EventEmitter();
      const coordinator = new ImportCoordinator({
        ...f.deps,
        library,
        chooseFile: async () => selected,
        run: async (input) => {
          // The dedicated decoder tests cover encoded audio. Inject decode and model output here.
          const result = await f.run(input);
          expect(input.sourcePath).toBe(selected);
          const transcript = result.transcript!;
          transcript.words = [
            {
              text: 'Wharf',
              speakerId: 'voice',
              track: 'meeting',
              startMs: 100,
              endMs: 400,
              confidence: 1,
            },
          ];
          transcript.turns = [
            {
              text: 'Wharf',
              speakerId: 'voice',
              startMs: 100,
              endMs: 400,
              firstWord: 0,
              wordCount: 1,
            },
          ];
          transcript.speakers = [
            { id: 'voice', label: 'Speaker 1', speechMs: 300, embeddingSegments: 0 },
          ];
          return result;
        },
        emit: (name, payload) => {
          if (name === 'importFinished' || name === 'importFailed') terminal.emit('done', payload);
        },
      });
      try {
        const finished = once(terminal, 'done', { signal: AbortSignal.timeout(4000) });
        void finished.catch(() => undefined);
        const picked = (await coordinator.handlers.pickAudioFile!(undefined)) as {
          fileToken: string;
          fileName: string;
        };
        expect(picked.fileName).toBe(`Invented source.${extension}`);
        const started = await coordinator.handlers.importAudioFile!({
          fileToken: picked.fileToken,
          buildVoiceProfiles: false,
        });
        expect(started).toMatchObject({ privacyBannerRequired: false });
        const [result] = (await finished) as [
          BackendEvents['importFinished'] | BackendEvents['importFailed'],
        ];
        expect(result).toHaveProperty('meetingId');
        if (!('meetingId' in result)) throw new Error(result.message);
        const { meetingId } = result;
        const handlers = createMeetingHandlers(library);
        expect(await handlers.getMeeting!({ meetingId })).toMatchObject({
          origin: 'imported',
          status: 'ready',
          speakerCount: 1,
        });
        expect(await library.getMeeting(meetingId)).toMatchObject({ buildVoiceProfiles: false });
        const transcript = await library.readTranscript(meetingId);
        expect(transcript.segments).toEqual([
          expect.objectContaining({ pass: 'final', track: 'meeting', speakerId: 'voice' }),
        ]);
        const word = transcript.segments[0]!.words[0]!;
        await library.applyCorrection(meetingId, {
          wordIds: [word.id],
          replacement: 'Pier',
          remember: false,
        });
        expect(await handlers.getTranscript!({ meetingId, offset: 0, limit: 10 })).toMatchObject({
          segments: [{ words: [{ text: 'Pier', state: 'corrected', startMs: 100, endMs: 400 }] }],
        });
        expect(await readdir(join(library.paths.cache, 'imports'))).toEqual([]);
        expect(await readFile(selected, 'utf8')).toBe(original);
        expect((await stat(selected)).mtimeMs).toBe(before.mtimeMs);
      } finally {
        await coordinator.shutdown();
        await library.close();
        await rm(f.root, { recursive: true, force: true });
      }
    },
  );

  it('requests the import privacy reminder only when building voice profiles', async () => {
    const f = await fixture();
    f.deps.privacyBanner.mockResolvedValue(true);
    const first = (await f.coordinator.handlers.pickAudioFile!(undefined)) as {
      fileToken: string;
    };
    const withoutProfiles = (await f.coordinator.handlers.importAudioFile!({
      fileToken: first.fileToken,
      buildVoiceProfiles: false,
    })) as { privacyBannerRequired: boolean };
    expect(withoutProfiles.privacyBannerRequired).toBe(false);
    expect(f.deps.privacyBanner).not.toHaveBeenCalled();
    await f.coordinator.shutdown();

    const g = await fixture();
    g.deps.privacyBanner.mockResolvedValue(true);
    const second = (await g.coordinator.handlers.pickAudioFile!(undefined)) as {
      fileToken: string;
    };
    const withProfiles = (await g.coordinator.handlers.importAudioFile!({
      fileToken: second.fileToken,
      buildVoiceProfiles: true,
    })) as { privacyBannerRequired: boolean };
    expect(withProfiles.privacyBannerRequired).toBe(true);
    expect(g.deps.privacyBanner).toHaveBeenCalledTimes(1);
    await g.coordinator.shutdown();
  });

  it('expires private tokens after ten minutes without disclosing the source path', async () => {
    const f = await fixture();
    const clock = vi.spyOn(Date, 'now');
    const at = Date.now();
    try {
      clock.mockReturnValue(at);
      const pick = (await f.coordinator.handlers.pickAudioFile!(undefined)) as {
        fileToken: string;
      };
      clock.mockReturnValue(at + 600_001);
      await expect(
        f.coordinator.handlers.importAudioFile!({
          fileToken: pick.fileToken,
          buildVoiceProfiles: false,
        }),
      ).rejects.toMatchObject({ code: 'notFound' });
      expect(f.run).not.toHaveBeenCalled();
      expect(f.library.createMeeting).not.toHaveBeenCalled();
      expect(await readFile(f.selected, 'utf8')).toBe('invented audio bytes');
    } finally {
      clock.mockRestore();
      await f.coordinator.shutdown();
    }
  });

  it('cancellation after provisional meeting creation discards the meeting and preserves source', async () => {
    const f = await fixture();
    let unblock!: () => void;
    f.applied.mockImplementation(
      async () =>
        new Promise<void>((resolve) => {
          unblock = resolve;
        }),
    );
    const file = (await f.coordinator.handlers.pickAudioFile!(undefined)) as { fileToken: string };
    const { importId } = (await f.coordinator.handlers.importAudioFile!({
      fileToken: file.fileToken,
      buildVoiceProfiles: false,
    })) as { importId: string };
    await vi.waitFor(() => expect(f.applied).toHaveBeenCalledTimes(1));
    const cancelled = f.coordinator.handlers.cancelImport!({ importId });
    unblock();
    await cancelled;
    expect(f.discard).toHaveBeenCalledTimes(1);
    expect(f.update).not.toHaveBeenCalledWith('imported-1', { status: 'ready' });
    expect(f.emit).toHaveBeenCalledWith('importCancelled', expect.objectContaining({ importId }));
    expect(f.emit).not.toHaveBeenCalledWith('importFinished', expect.anything());
    expect(await readFile(f.selected, 'utf8')).toBe('invented audio bytes');
    await f.coordinator.shutdown();
  });

  it.each(['failure', 'cancel', 'preempt'] as const)(
    'revokes before discarding a provisional meeting after %s',
    async (mode) => {
      const f = await fixture();
      let release!: () => void;
      let reject!: (error: Error) => void;
      let entered!: () => void;
      const applying = new Promise<void>((resolve) => {
        entered = resolve;
      });
      f.applied.mockImplementation(
        () =>
          new Promise<void>((resolve, fail) => {
            release = resolve;
            reject = fail;
            entered();
          }),
      );
      const order: string[] = [];
      f.deps.beforeDelete.mockImplementation((id) => {
        order.push(`revoke:${id}`);
      });
      f.discard.mockImplementation(async () => {
        expect(order).toEqual(['revoke:imported-1']);
        order.push('delete');
        return { meetingId: 'imported-1', ok: true, remaining: [] };
      });
      let finished!: () => void;
      const terminal = new Promise<void>((resolve) => {
        finished = resolve;
      });
      f.emit.mockImplementation((name: string) => {
        if (name === 'importFailed' || name === 'importCancelled') finished();
      });
      const file = (await f.coordinator.handlers.pickAudioFile!(undefined)) as {
        fileToken: string;
      };
      const { importId } = (await f.coordinator.handlers.importAudioFile!({
        fileToken: file.fileToken,
        buildVoiceProfiles: false,
      })) as { importId: string };
      await applying;
      if (mode === 'failure') reject(new Error('invented failure'));
      else {
        const done =
          mode === 'preempt'
            ? f.coordinator.stopForRecording()
            : f.coordinator.handlers.cancelImport!({ importId });
        release();
        await done;
      }
      await terminal;
      expect(order).toEqual(['revoke:imported-1', 'delete']);
      expect(f.deps.beforeDelete).toHaveBeenCalledTimes(1);
      expect(await readFile(f.selected, 'utf8')).toBe('invented audio bytes');
      await f.coordinator.shutdown();
    },
  );

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
      'warn',
      'import-recovery-cleanup-failed',
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
    await mkdir(join(stageRoot, `${orphan}.importing-0a1b2c3d`), { recursive: true });
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
    expect(f.run).toHaveBeenCalledWith(expect.objectContaining({ vocabularyHint: '' }));
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

  it('reports incomplete provisional deletion as failure rather than successful cancellation', async () => {
    const f = await fixture();
    let unblock!: () => void;
    f.applied.mockImplementation(
      async () =>
        new Promise<void>((resolve) => {
          unblock = resolve;
        }),
    );
    f.discard.mockResolvedValue({
      meetingId: 'imported-1',
      ok: false,
      remaining: ['index:meetings'],
    });
    const file = (await f.coordinator.handlers.pickAudioFile!(undefined)) as { fileToken: string };
    const { importId } = (await f.coordinator.handlers.importAudioFile!({
      fileToken: file.fileToken,
      buildVoiceProfiles: false,
    })) as { importId: string };
    await vi.waitFor(() => expect(f.applied).toHaveBeenCalledTimes(1));
    const cancelled = f.coordinator.handlers.cancelImport!({ importId });
    unblock();
    await cancelled;
    expect(f.emit).toHaveBeenCalledWith(
      'importFailed',
      expect.objectContaining({ importId, reason: 'internal' }),
    );
    expect(f.emit).not.toHaveBeenCalledWith('importCancelled', expect.anything());
    expect(f.discard).toHaveBeenCalledTimes(1);
    expect(await readFile(f.selected, 'utf8')).toBe('invented audio bytes');
    expect(JSON.stringify(vi.mocked(f.library.logger.log).mock.calls)).not.toContain(f.root);
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

  it('reports a file without audio as unreadable', async () => {
    const f = await fixture();
    f.deps.run.mockRejectedValue(Object.assign(new Error('invented'), { code: 'no_audio' }));
    const file = (await f.coordinator.handlers.pickAudioFile!(undefined)) as { fileToken: string };
    await f.coordinator.handlers.importAudioFile!({
      fileToken: file.fileToken,
      buildVoiceProfiles: false,
    });
    await vi.waitFor(() =>
      expect(f.emit).toHaveBeenCalledWith(
        'importFailed',
        expect.objectContaining({ reason: 'unreadable' }),
      ),
    );
    await f.coordinator.shutdown();
  });

  it('logs the stage and system error behind a failed import, without its message', async () => {
    const f = await fixture();
    const cause = Object.assign(new Error('EPERM: rename C:\\private'), {
      code: 'EPERM',
      syscall: 'rename',
    });
    f.deps.run.mockRejectedValue(
      Object.assign(new Error('unreadable: private', { cause }), { code: 'unreadable' }),
    );
    const file = (await f.coordinator.handlers.pickAudioFile!(undefined)) as { fileToken: string };
    await f.coordinator.handlers.importAudioFile!({
      fileToken: file.fileToken,
      buildVoiceProfiles: false,
    });
    await vi.waitFor(() =>
      expect(f.library.logger.log).toHaveBeenCalledWith('error', 'import-failed', {
        stage: 'queued',
        error: 'Error',
        code: 'unreadable',
        osCode: 'EPERM',
        syscall: 'rename',
      }),
    );
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
  it('reports failed stage removal without cancelling', async () => {
    const f = await fixture();
    f.deps.run.mockRejectedValue(new Error('invented decoder failure'));
    f.deps.removeStaging = vi.fn(async () => {
      throw Object.assign(new Error('private stage path'), { code: 'EACCES' });
    });
    const before = await stat(f.selected);
    const file = (await f.coordinator.handlers.pickAudioFile!(undefined)) as { fileToken: string };
    const { importId } = (await f.coordinator.handlers.importAudioFile!({
      fileToken: file.fileToken,
      buildVoiceProfiles: false,
    })) as { importId: string };
    await vi.waitFor(() =>
      expect(f.emit).toHaveBeenCalledWith(
        'importFailed',
        expect.objectContaining({
          importId,
          message: 'Import cleanup was incomplete. Restart to retry recovery.',
        }),
      ),
    );
    expect(f.emit).not.toHaveBeenCalledWith('importCancelled', expect.anything());
    expect(JSON.stringify(vi.mocked(f.library.logger.log).mock.calls)).not.toContain(f.root);
    expect(await readFile(f.selected, 'utf8')).toBe('invented audio bytes');
    expect((await stat(f.selected)).mtimeMs).toBe(before.mtimeMs);
    await f.coordinator.shutdown();
  });

  it('waits for import cleanup before recording', async () => {
    const f = await fixture();
    f.deps.run.mockImplementation(async ({ signal }: { signal: AbortSignal }) => {
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
      throw new Error('unreachable');
    });
    let releaseCleanup!: () => void;
    let enteredCleanup!: () => void;
    const entered = new Promise<void>((resolve) => {
      enteredCleanup = resolve;
    });
    f.deps.removeStaging = vi.fn(async (folder: string) => {
      enteredCleanup();
      await new Promise<void>((resolve) => {
        releaseCleanup = resolve;
      });
      await rm(folder, { recursive: true, force: true });
    });
    const selected = (await f.coordinator.handlers.pickAudioFile!(undefined)) as {
      fileToken: string;
    };
    const { importId } = (await f.coordinator.handlers.importAudioFile!({
      fileToken: selected.fileToken,
      buildVoiceProfiles: false,
    })) as { importId: string };
    let preemptFinished = false;
    const preempt = f.coordinator.stopForRecording().then(() => {
      preemptFinished = true;
    });
    await entered;
    expect(preemptFinished).toBe(false);
    releaseCleanup();
    await preempt;
    expect(preemptFinished).toBe(true);
    expect(f.emit).toHaveBeenCalledWith(
      'importFailed',
      expect.objectContaining({
        importId,
        reason: 'recordingInProgress',
      }),
    );
    expect(f.emit).not.toHaveBeenCalledWith('importCancelled', expect.anything());
    expect(await readFile(f.selected, 'utf8')).toBe('invented audio bytes');
    await f.coordinator.shutdown();
  });

  it('reconciles interrupted provisional meetings on reopen', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scrb-import-reopen-'));
    const selected = join(root, 'original.wav');
    await writeFile(selected, 'invented original audio');
    const before = await stat(selected);
    const libraryRoot = join(root, 'library');
    const opened = await Library.open({ root: libraryRoot });
    const provisional = await opened.createMeeting({
      title: 'Interrupted import',
      source: 'imported',
      status: 'importing',
    });
    await opened.close();
    const reopened = await Library.open({ root: libraryRoot });
    try {
      expect(reopened.openReport.discardedImports).toContain(provisional.id);
      expect(reopened.listMeetings().some((row) => row.id === provisional.id)).toBe(false);
      expect(await readFile(selected, 'utf8')).toBe('invented original audio');
      expect((await stat(selected)).mtimeMs).toBe(before.mtimeMs);
    } finally {
      await reopened.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
