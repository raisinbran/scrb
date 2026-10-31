import { app, shell } from 'electron';
import path from 'node:path';
import {
  createFinalPassRunner,
  createSettingsHandlers,
  FinalPassQueue,
  resumeFinalPasses,
  needsPrivacyBanner,
  privacyJurisdictions,
} from '@scrb/app-core';
import { Library, readLibraryLocation, StorageError } from '@scrb/storage';
import type { SettingsPatch } from '@scrb/contracts';
import type { BackendEvents, EventName } from '@scrb/contracts';
import type { CallHandlers } from './dispatch.ts';
import { createMeetingHandlers } from './meetings.ts';
import { RecordingController, recoverInterrupted } from './recording.ts';

export interface OpenedBackend {
  handlers: CallHandlers;
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
    const settings = createSettingsHandlers(library.settings, root);
    library.setMeetingChangedListener((meeting) => emit('meetingChanged', {
      id: meeting.id,
      title: meeting.title,
      startedAt: meeting.date,
      durationMs: meeting.durationMs,
      origin: meeting.source,
      status: meeting.status,
      summaryState: 'notGenerated',
      speakerCount: 0,
    }));
    // Real recording is opt-in until packaging ships the helper; otherwise the mock answers.
    const helper = app.isPackaged ? undefined : process.env['SCRB_CAPTURE_HELPER'];
    // Same rule for the final pass: it needs models and tools that packaging does not ship yet.
    const finalPassConfig = app.isPackaged ? undefined : process.env['SCRB_FINAL_PASS_CONFIG'];
    const finalPasses =
      helper && finalPassConfig
        ? new FinalPassQueue(library, createFinalPassRunner(finalPassConfig))
        : null;
    if (helper) await recoverInterrupted(library, helper, finalPasses);
    await resumeFinalPasses(library, finalPasses);
    const recording = helper
      ? new RecordingController(
          library,
          helper,
          emit,
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
        )
      : null;
    const stopRetention = library.startAutoDeleteSchedule();
    return {
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
        // Real import jobs are not wired into the main process yet.
        listImports: async () => [],
        getPrivacyJurisdictions: async () => privacyJurisdictions(library.paths.root),
        getSettings: async () => settings.getSettings(),
        updateSettings: async (request) => settings.updateSettings(request as SettingsPatch),
        ...createMeetingHandlers(library, emit, (folder) => shell.openPath(folder), finalPasses),
        ...recording?.handlers,
      },
      warning: library.retainedIndexSnapshot
        ? 'The index was upgraded and verified, but the old recovery copy could not be removed. It may retain older deleted data.'
        : library.replacedCorruptIndex === null
          ? null
          : 'The index needs review; all original files were preserved.',
      close: async () => {
        stopRetention();
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
      recovery: { kind: 'blocked', folder: await readLibraryLocation(app.getPath('userData'), fallback) },
      handlers: {},
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
