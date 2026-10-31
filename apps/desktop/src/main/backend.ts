import { app } from 'electron';
import path from 'node:path';
import {
  createFinalPassRunner,
  createSettingsHandlers,
  FinalPassQueue,
  resumeFinalPasses,
} from '@scrb/app-core';
import { Library, readLibraryLocation } from '@scrb/storage';
import type { SettingsPatch } from '@scrb/contracts';
import type { BackendEvents, EventName } from '@scrb/contracts';
import type { CallHandlers } from './dispatch.ts';
import { createMeetingHandlers } from './meetings.ts';
import { RecordingController, recoverInterrupted } from './recording.ts';

export interface OpenedBackend {
  handlers: CallHandlers;
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
        )
      : null;
    return {
      handlers: {
        getSettings: async () => settings.getSettings(),
        updateSettings: async (request) => settings.updateSettings(request as SettingsPatch),
        ...createMeetingHandlers(library, emit),
        ...recording?.handlers,
      },
      warning:
        library.replacedCorruptIndex === null
          ? null
          : 'The app index was damaged and has been replaced. Settings are back to their defaults.',
      close: async () => {
        // The workers stop first, so a helper that never acks cannot leave one running.
        const passes = finalPasses?.shutdown();
        await recording?.shutdown();
        await passes;
        await library.close();
      },
    };
  } catch {
    return {
      handlers: {},
      warning: 'The library could not be opened, so settings changes will not be saved.',
      close: async () => undefined,
    };
  }
}
