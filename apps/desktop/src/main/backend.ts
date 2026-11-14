import { app, dialog, shell, systemPreferences } from 'electron';
import path from 'node:path';
import {
  createConfiguredImportRunner,
  createFinalPassRunner,
  startProfileMatching,
  LargeModelGate,
  createSettingsHandlers,
  recommendQuality,
  resolvePerformance,
  FinalPassQueue,
  resumeFinalPasses,
  needsPrivacyBanner,
  privacyJurisdictions,
} from '@scrb/app-core';
import { Library, readLibraryLocation, StorageError } from '@scrb/storage';
import { LlamaServerWorker, extractItems, writeSummary } from '@scrb/summary';
import type { RecordingState, SettingsPatch } from '@scrb/contracts';
import type { BackendEvents, EventName } from '@scrb/contracts';
import type { CallHandlers } from './dispatch.ts';
import { createMeetingHandlers, publishEdit, readSummaryState } from './meetings.ts';
import { PlaybackMedia } from './playback-media.ts';
import { RecordingController, recoverInterrupted } from './recording.ts';
import { applyLivePerformance, readLiveSetup, readWhisperOverride } from './live-feed.ts';
import { ImportCoordinator } from './imports.ts';
import { createExportHandlers } from './export.ts';
import { readSummaryPaths, SummaryController, type SummaryEngine } from './summary.ts';
import { createDocxRenderer } from './export-worker.ts';
import { printHtmlToPdf } from './export-print.ts';
import { createSetupStatusHandler } from './setup-status.ts';
import {
  DIGESTS,
  MODELS,
  missingMessage,
  modelsDirFor,
  verified,
  resolvePackagedSetup,
  type PackagedSetup,
} from './packaged-setup.ts';
import { ContractError } from '@scrb/contracts';
import { createModelDownloader, extractWithTar, sourcesFor } from './model-download.ts';
import os from 'node:os';

export interface OpenedBackend {
  handlers: CallHandlers;
  /** Null when no library opened, so there is no audio to serve. */
  playback: PlaybackMedia | null;
  recovery: { kind: 'blocked' | 'retainedCopy'; folder: string } | null;
  /** Shown once the window is up: a message box with no window blocks launch on macOS. */
  warning: string | null;
  close(): Promise<void>;
}

/** Opens the library. On failure the app still runs and the UI keeps settings for this run only. */
export async function openBackend(
  emit: <K extends EventName>(name: K, payload: BackendEvents[K]) => void,
): Promise<OpenedBackend> {
  const fallback = path.join(app.getPath('documents'), 'Meeting Scribe');
  try {
    const root = await readLibraryLocation(app.getPath('userData'), fallback);
    const library = await Library.open({ root });
    const playback = new PlaybackMedia(library, emit);
    const hardware = { cores: os.availableParallelism(), memoryBytes: os.totalmem() };
    const settings = createSettingsHandlers(library.settings, root, recommendQuality(hardware));
    const plan = () => resolvePerformance(settings.getSettings().transcriptionQuality, hardware);
    const modelGate = new LargeModelGate();
    // Recording always wins: a recording that starts stops any running summary.
    let recording: RecordingController | null = null;
    const engine: SummaryEngine = {
      server: (paths, options) => new LlamaServerWorker({ ...paths, ...options }),
      extractItems,
      writeSummary,
    };
    const summaries = new SummaryController({
      library,
      emit,
      gate: modelGate,
      engine,
      recordingActive: () => recording?.isBusy() ?? false,
      readPaths: () => readSummaryPaths(finalPassConfig),
      pidFile: path.join(app.getPath('userData'), 'summary-server.pid'),
    });
    await summaries.stopStaleServer();
    const emitObserved: typeof emit = (name, payload) => {
      emit(name, payload);
      if (name === 'recordingStateChanged' && (payload as RecordingState).status !== 'idle') {
        summaries.recordingStarted();
      }
    };
    library.setMeetingChangedListener((meeting) => {
      void readSummaryState(library, meeting.id, (id) => summaries.isRunning(id)).then(
        (summaryState) =>
          emit('meetingChanged', {
            id: meeting.id,
            title: meeting.title,
            startedAt: meeting.date,
            durationMs: meeting.durationMs,
            origin: meeting.source,
            status: meeting.status,
            summaryState,
            speakerCount: 0,
          }),
      );
    });
    // Unpackaged: real mode is opt-in through the environment, otherwise the mock answers.
    // Packaged: paths come only from the bundle and the models folder, never the environment.
    const packaged: PackagedSetup | null = app.isPackaged
      ? await resolvePackagedSetup({
          resourcesPath: process.resourcesPath,
          userDataPath: app.getPath('userData'),
          modelsDir: modelsDirFor(os.homedir()),
        })
      : null;
    const modelsDir = modelsDirFor(os.homedir());
    const modelDownloader = packaged
      ? createModelDownloader({
          dir: modelsDir,
          sources: sourcesFor(MODELS, DIGESTS),
          extract: extractWithTar,
          isInstalled: (source) =>
            verified(
              path.join(modelsDir, source.file),
              source.file,
              path.join(app.getPath('userData'), 'config', 'model-verified.json'),
              DIGESTS,
            ),
          onProgress: (progress) =>
            emit('modelDownloadProgress', {
              ...progress,
              ...(progress.state === 'done'
                ? { message: 'Reopen Scribe when all models are done.' }
                : {}),
            }),
        })
      : null;
    if (packaged && packaged.missing.length > 0)
      library.logger.log('error', 'packaged-setup-incomplete', { count: packaged.missing.length });
    const helper = packaged ? (packaged.helper ?? undefined) : process.env['SCRB_CAPTURE_HELPER'];
    const finalPassConfig = packaged
      ? (packaged.finalPassConfig ?? undefined)
      : process.env['SCRB_FINAL_PASS_CONFIG'];
    const finalPasses =
      helper && finalPassConfig
        ? new FinalPassQueue(
            library,
            createFinalPassRunner(finalPassConfig, () => plan().finalThreads),
            modelGate,
            undefined,
            (before, after) => publishEdit(before, after, emit),
            (report) => emit('finalPassProgress', report),
          )
        : null;
    const liveConfig = packaged
      ? (packaged.liveConfig ?? undefined)
      : process.env['SCRB_LIVE_CONFIG'];
    const livePlatform = process.platform === 'darwin' || process.platform === 'win32';
    const baseLiveSetup =
      livePlatform && helper && liveConfig
        ? await readLiveSetup(liveConfig, path.join(__dirname, 'liveWorkerEntry.mjs'))
        : null;
    const whisperOverride = liveConfig ? await readWhisperOverride(liveConfig) : false;
    const liveSetup = () => {
      const resolved = plan();
      const setup = applyLivePerformance(baseLiveSetup, resolved, whisperOverride);
      library.logger.log('info', 'performance-plan', { ...resolved, whisperOverride });
      return setup;
    };
    if (liveConfig && !baseLiveSetup && livePlatform)
      library.logger.log('error', 'live-config-unavailable', {});
    if (helper) await recoverInterrupted(library, helper, finalPasses);
    await resumeFinalPasses(library, finalPasses);
    let imports: ImportCoordinator | null = null;
    recording = helper
      ? new RecordingController(
          library,
          helper,
          emitObserved,
          {
            read: () => settings.getSettings().audio,
            save: (selection) => settings.updateSettings({ audio: selection }),
          },
          finalPasses,
          async () => {
            const rules = await privacyJurisdictions(library.paths.root);
            const region = app.getLocaleCountryCode() || null;
            return needsPrivacyBanner(settings.getSettings().location, rules, region);
          },
          liveSetup,
          async () => {
            summaries.recordingStarted();
            await imports?.stopForRecording();
          },
          // Spike: opt-in until output ducking and meeting-track health are measured (docs/plans/mic-echo-handling.md).
          () => {
            const audio = settings.getSettings().audio;
            return (
              process.env.SCRB_VOICE_AEC === '1' &&
              audio.echoCancellation &&
              !audio.bypassSystemInputProcessing
            );
          },
        )
      : null;
    imports = finalPassConfig
      ? new ImportCoordinator({
          library,
          chooseFile: async () => {
            const picked = await dialog.showOpenDialog({
              properties: ['openFile'],
              filters: [
                {
                  name: 'Audio files',
                  extensions: ['wav', 'mp3', 'm4a', 'flac', 'opus', 'ogg'],
                },
              ],
            });
            return picked.canceled ? null : (picked.filePaths[0] ?? null);
          },
          run: createConfiguredImportRunner(finalPassConfig),
          startMatching: (store) => {
            const match = startProfileMatching(store);
            return async (...args) => {
              const edit = await match(...args);
              if (edit) {
                try {
                  publishEdit(edit.before, edit.after, emit);
                } catch {
                  store.logger.log('warn', 'profile-matching-notification-failed', {});
                }
              }
              return edit;
            };
          },
          beforeDelete: (meetingId) => playback.revokeMeeting(meetingId),
          recordingBusy: () => recording?.isBusy() ?? false,
          privacyBanner: async () => {
            const rules = await privacyJurisdictions(library.paths.root);
            return needsPrivacyBanner(
              settings.getSettings().location,
              rules,
              app.getLocaleCountryCode() || null,
            );
          },
          emit,
          modelGate,
        })
      : null;
    if (imports) await imports.recoverInterrupted();
    // A running summary is stopped, and its server has exited, before the meeting is deleted.
    const stopRetention = library.startAutoDeleteSchedule(undefined, async (meetingId) => {
      await summaries.stopAndWait(meetingId, 'deleted');
      playback.revokeMeeting(meetingId);
    });
    return {
      playback,
      recovery: library.retainedIndexSnapshot ? { kind: 'retainedCopy', folder: root } : null,
      handlers: {
        getAppInfo: async () => ({
          name: app.getName(),
          version: app.getVersion(),
          buildDate: 'Not recorded',
          copyright: '© 2026 BJC, all rights reserved; personal use only',
          storageStatement: 'Recordings, transcripts and voice profiles stay on this computer.',
          models: [],
        }),
        // An empty list is explicit until redistribution licenses are verified.
        getLicenses: async () => [],
        listImports: async () => imports?.list() ?? [],
        ...imports?.handlers,
        getPrivacyJurisdictions: async () => privacyJurisdictions(library.paths.root),
        getSettings: async () => settings.getSettings(),
        updateSettings: async (request) => settings.updateSettings(request as SettingsPatch),
        getSetupStatus: createSetupStatusHandler({
          readSettings: settings.getSettings,
          helper,
          finalPassConfig,
          liveConfig,
          microphoneStatus:
            process.platform === 'darwin' || process.platform === 'win32'
              ? () => systemPreferences.getMediaAccessStatus('microphone')
              : undefined,
        }),
        ...deleteAfterSummaryStops(
          playback.wrap(
            createMeetingHandlers(
              library,
              emit,
              (folder) => shell.openPath(folder),
              finalPasses,
              (id) => summaries.isRunning(id),
            ),
          ),
          summaries,
        ),
        ...summaries.handlers,
        ...createExportHandlers({
          library,
          emit,
          print: printHtmlToPdf,
          renderDocx: createDocxRenderer(path.join(__dirname, 'exportWorkerEntry.mjs')),
        }),
        ...recording?.handlers,
        ...(packaged && packaged.models.some((m) => !m.installed) && modelDownloader
          ? {
              startModelDownload: async () => modelDownloader.start(),
              cancelModelDownload: async () => modelDownloader.cancel(),
            }
          : {}),
        // A packaged app without its tools or models must say so, not fall back to the mock.
        ...(packaged && packaged.missing.length > 0
          ? {
              startRecording: async () => {
                throw new ContractError({
                  code: 'conflict',
                  message: missingMessage(packaged.missing),
                });
              },
              // The UI reads this refusal to show the setup-incomplete state instead of the mock.
              getRecordingSnapshot: async () => {
                throw new ContractError({
                  code: 'conflict',
                  message: missingMessage(packaged.missing),
                });
              },
            }
          : {}),
      },
      warning: library.retainedIndexSnapshot
        ? 'The index was upgraded and verified, but the old recovery copy could not be removed. It may retain older deleted data.'
        : library.replacedCorruptIndex !== null
          ? 'The index needs review; all original files were preserved.'
          : packaged && packaged.missing.length > 0
            ? missingMessage(packaged.missing)
            : null,
      close: async () => {
        modelDownloader?.cancel();
        playback.stop();
        stopRetention();
        await summaries.shutdown();
        await imports?.shutdown();
        // The workers stop first, so a helper that never acks cannot leave one running.
        const passes = finalPasses?.shutdown();
        await recording?.shutdown();
        await passes;
        await library.close();
      },
    };
  } catch (error) {
    const code = error instanceof StorageError ? error.code : null;
    return {
      recovery: {
        kind: 'blocked',
        folder: await readLibraryLocation(app.getPath('userData'), fallback),
      },
      handlers: {},
      playback: null,
      warning:
        code === 'INDEX_SPACE'
          ? 'There is not enough disk space to upgrade the library. Its files were kept. Free some space and reopen the app.'
          : code === 'INDEX_RECOVERY_REQUIRED'
            ? 'An unfinished index upgrade needs review. The index and recovery snapshot are preserved; library features are unavailable until it is resolved.'
            : 'The library could not be opened. Its files were kept; library features are unavailable until it is repaired.',
      close: async () => undefined,
    };
  }
}

/** A run is stopped, and its server has exited, before the meeting's files are deleted. */
function deleteAfterSummaryStops(
  handlers: CallHandlers,
  summaries: SummaryController,
): CallHandlers {
  const deleteMeeting = handlers.deleteMeeting;
  if (!deleteMeeting) return handlers;
  return {
    ...handlers,
    deleteMeeting: async (request) => {
      await summaries.stopAndWait((request as { meetingId: string }).meetingId, 'deleted');
      return deleteMeeting(request);
    },
  };
}
