import { app, dialog, shell, systemPreferences, type BrowserWindow } from 'electron';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
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
import { createSharedLibraryNotice } from './library-notice.ts';
import { ensureSyntheticDevelopmentLocation } from './synthetic-location.ts';
import { Library, readLibraryLocation, StorageError } from '@scrb/storage';
import { LlamaServerWorker, extractItems, generateTitle, writeSummary } from '@scrb/summary';
import { AutoTitleController } from './auto-title.ts';
import type { RecordingState, SettingsPatch } from '@scrb/contracts';
import type { BackendEvents, EventName, ModelRole } from '@scrb/contracts';
import type { CallHandlers } from './dispatch.ts';
import { createMeetingHandlers, publishEdit, readSummaryState } from './meetings.ts';
import { PlaybackMedia } from './playback-media.ts';
import { RecordingController, recoverInterrupted } from './recording.ts';
import { applyLivePerformance, readLiveSetup, readWhisperOverride } from './live-feed.ts';
import { ImportCoordinator } from './imports.ts';
import { createExportHandlers, ExportRefused } from './export.ts';
import { SummaryController, type SummaryEngine } from './summary.ts';
import { createDocxRenderer } from './export-worker.ts';
import { printHtmlToPdf } from './export-print.ts';
import { createSetupStatusHandler } from './setup-status.ts';
import {
  DIGESTS,
  MODELS,
  missingMessage,
  modelsDirFor,
  listModelRows,
  verified,
  resolvePackagedSetup,
  summaryPathsReader,
  listSummaryRow,
  SUMMARY_MODEL,
  type PackagedSetup,
} from './packaged-setup.ts';
import { ContractError } from '@scrb/contracts';
import {
  cancelModelDownloadersOnClose,
  createModelDownloader,
  createSummaryModelDownloader,
  extractWithTar,
  sourcesFor,
} from './model-download.ts';
import { isIdle, relaunchWhenIdle, withReadyMessage } from './models-ready.ts';
import os from 'node:os';

const FORMAT_NAMES = { docx: 'Word document', pdf: 'PDF', vtt: 'WebVTT captions' } as const;

/** Resolves a not-yet-created library path through its nearest existing ancestor. */
function resolveForIsolation(target: string): string {
  let candidate = path.resolve(target);
  const suffix: string[] = [];
  while (true) {
    try {
      lstatSync(candidate);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) throw new Error('Unable to resolve isolated library path.');
    suffix.unshift(path.basename(candidate));
    candidate = parent;
  }
  return path.resolve(realpathSync(candidate), ...suffix);
}

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
  parentWindow: () => BrowserWindow | null = () => null,
): Promise<OpenedBackend> {
  const fallback = path.join(app.getPath('documents'), 'Meeting Scribe');
  try {
    const userData = app.getPath('userData');
    const root = await readLibraryLocation(userData, fallback);
    const libraryLocationFile = path.join(userData, 'library-location.json');
    let isolatedTemporaryPaths: { userData: string; libraryRoot: string; tempRoot: string } | null =
      null;
    if (
      process.env['SCRB_DEV_AUTO_LOCATION'] === '1' &&
      !app.isPackaged &&
      app.commandLine.hasSwitch('user-data-dir') &&
      existsSync(libraryLocationFile)
    ) {
      try {
        const profilePath = realpathSync(userData);
        const libraryPath = resolveForIsolation(root);
        const tempPath = realpathSync(app.getPath('temp'));
        const withinTemp = (target: string) => {
          const relative = path.relative(tempPath, target);
          return (
            relative !== '' &&
            relative !== '..' &&
            !relative.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relative)
          );
        };
        if (withinTemp(profilePath) && withinTemp(libraryPath) && profilePath !== libraryPath) {
          isolatedTemporaryPaths = {
            userData: profilePath,
            libraryRoot: libraryPath,
            tempRoot: tempPath,
          };
        }
      } catch {
        // A missing or unresolved explicit test path fails closed; normal startup still proceeds.
      }
    }
    const library = await Library.open({ root });
    const playback = new PlaybackMedia(library, emit);
    const hardware = { cores: os.availableParallelism(), memoryBytes: os.totalmem() };
    const settings = createSettingsHandlers(library.settings, root, recommendQuality(hardware));
    const syntheticLocation = ensureSyntheticDevelopmentLocation(settings, {
      enabled: isolatedTemporaryPaths !== null,
      packaged: app.isPackaged,
      explicitUserData: app.commandLine.hasSwitch('user-data-dir'),
      explicitLibrary: existsSync(libraryLocationFile),
      userData: isolatedTemporaryPaths?.userData ?? userData,
      libraryRoot: isolatedTemporaryPaths?.libraryRoot ?? root,
      tempRoot: isolatedTemporaryPaths?.tempRoot ?? app.getPath('temp'),
      appData: app.getPath('appData'),
      appName: app.getName(),
      platform: process.platform,
    });
    if (syntheticLocation)
      console.info(
        `[development] Saved synthetic location US/${syntheticLocation} to test library.`,
      );
    const plan = () => resolvePerformance(settings.getSettings().transcriptionQuality, hardware);
    const modelGate = new LargeModelGate();
    // Recording always wins: a recording that starts stops any running summary.
    let recording: RecordingController | null = null;
    const engine: SummaryEngine = {
      server: (paths, options) => new LlamaServerWorker({ ...paths, ...options }),
      extractItems,
      writeSummary,
    };
    // Chosen by the packaged state, not by SCRB_FINAL_PASS_CONFIG; the config variable below is read lazily.
    const summaryPaths = summaryPathsReader({
      packaged: app.isPackaged,
      get finalPassConfig() {
        return finalPassConfig;
      },
      resourcesPath: process.resourcesPath,
      modelsDir: modelsDirFor(os.homedir()),
      cacheFile: path.join(app.getPath('userData'), 'config', 'model-verified.json'),
    });
    const summaries = new SummaryController({
      library,
      emit,
      gate: modelGate,
      engine,
      recordingActive: () => recording?.isBusy() ?? false,
      readPaths: summaryPaths,
      pidFile: path.join(app.getPath('userData'), 'summary-server.pid'),
    });
    await summaries.stopStaleServer();
    const titles = new AutoTitleController({
      library,
      gate: modelGate,
      engine,
      recordingActive: () => recording?.isBusy() ?? false,
      readPaths: summaryPaths,
      pidFile: path.join(app.getPath('userData'), 'summary-server.pid'),
      generate: generateTitle,
    });
    const emitObserved: typeof emit = (name, payload) => {
      emit(name, payload);
      if (name === 'recordingStateChanged' && (payload as RecordingState).status !== 'idle') {
        summaries.recordingStarted();
        titles.recordingStarted();
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
    const verifiedCache = path.join(app.getPath('userData'), 'config', 'model-verified.json');
    const idleNow = () => isIdle({ recording, finalPasses, imports });
    // Only a missing model is fixed by a restart: with a tool missing too, the restart would not help.
    const restartFixesIt = packaged?.missing.every((item) => item.startsWith('model ')) ?? false;
    const modelDownloader = packaged
      ? createModelDownloader(
          {
            dir: modelsDir,
            sources: sourcesFor(MODELS, DIGESTS),
            extract: extractWithTar,
            isInstalled: (source) =>
              verified(path.join(modelsDir, source.file), source.file, verifiedCache, DIGESTS),
            // A restart is only promised when it will happen: idle, and nothing but models missing.
            onProgress: (progress) =>
              emit(
                'modelDownloadProgress',
                withReadyMessage(progress, restartFixesIt && idleNow()),
              ),
          },
          () => {
            // Verify again from disk: the restart must not happen on a hunch.
            void listModelRows(modelsDir, verifiedCache).then((rows) => {
              if (!restartFixesIt || !rows.every((row) => row.installed)) return;
              relaunchWhenIdle(app, idleNow);
            });
          },
        )
      : null;
    const summaryModelDownloader = packaged
      ? createSummaryModelDownloader({
          dir: modelsDir,
          sources: sourcesFor([SUMMARY_MODEL], DIGESTS),
          extract: extractWithTar,
          isInstalled: (source) =>
            verified(path.join(modelsDir, source.file), source.file, verifiedCache, DIGESTS),
          onProgress: (progress) => emit('modelDownloadProgress', progress),
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
            (meetingId) => titles.enqueue(meetingId),
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
            titles.recordingStarted();
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
    const baseWarning = library.retainedIndexSnapshot
      ? 'The index was upgraded and verified, but the old recovery copy could not be removed. It may retain older deleted data.'
      : library.replacedCorruptIndex !== null
        ? 'The index needs review; all original files were preserved.'
        : packaged && packaged.missing.length > 0
          ? missingMessage(packaged.missing)
          : null;
    const sharedNotice = createSharedLibraryNotice(library.settings, library.rootMayBeShared);
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
        getSharedLibraryNotice: async () => sharedNotice.get(),
        dismissSharedLibraryNotice: async () => sharedNotice.dismiss(),
        getSettings: async () => settings.getSettings(),
        updateSettings: async (request) => settings.updateSettings(request as SettingsPatch),
        getSetupStatus: createSetupStatusHandler({
          readSettings: settings.getSettings,
          helper,
          finalPassConfig,
          liveConfig,
          readModels: packaged
            ? async () => [
                ...(await listModelRows(modelsDir, verifiedCache)),
                await listSummaryRow(modelsDir, verifiedCache),
              ]
            : undefined,
          downloading: () => modelDownloader?.isRunning() ?? false,
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
          locationFile: path.join(app.getPath('userData'), 'export-location.json'),
          revealPath: (file) => shell.showItemInFolder(file),
          chooseSavePath: async ({ defaultPath, format }) => {
            const parent = parentWindow();
            if (!parent) throw new ExportRefused('The window was closed.');
            const picked = await dialog.showSaveDialog(parent, {
              defaultPath,
              filters: [{ name: FORMAT_NAMES[format], extensions: [format] }],
              properties: ['createDirectory', 'showOverwriteConfirmation'],
            });
            return picked.canceled ? null : (picked.filePath ?? null);
          },
        }),
        ...recording?.handlers,
        ...(packaged && packaged.models.some((m) => !m.installed) && modelDownloader
          ? {
              startModelDownload: async () => modelDownloader.start(),
            }
          : {}),
        ...(packaged && (modelDownloader || summaryModelDownloader)
          ? {
              cancelModelDownload: async () => {
                modelDownloader?.cancel();
                summaryModelDownloader?.cancel();
              },
            }
          : {}),
        ...(summaryModelDownloader
          ? {
              installModelUpdate: async (request: unknown) => {
                const { role } = request as { role: ModelRole };
                if (role !== 'summary')
                  throw new ContractError({
                    code: 'notImplemented',
                    message: 'This model update is not available.',
                  });
                summaryModelDownloader.start();
              },
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
      get warning() {
        return baseWarning;
      },
      close: async () => {
        cancelModelDownloadersOnClose(modelDownloader, summaryModelDownloader);
        playback.stop();
        stopRetention();
        await summaries.shutdown();
        await titles.shutdown();
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
