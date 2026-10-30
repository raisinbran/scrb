import { app, dialog } from 'electron';
import path from 'node:path';
import { createSettingsHandlers } from '@scrb/app-core';
import { Library, readLibraryLocation } from '@scrb/storage';
import type { SettingsPatch } from '@scrb/contracts';
import type { CallHandlers } from './dispatch.ts';

export interface OpenedBackend {
  handlers: CallHandlers;
  close(): Promise<void>;
}

const NOTHING_OPEN: OpenedBackend = { handlers: {}, close: async () => undefined };

function warn(message: string): void {
  void dialog.showMessageBox({ type: 'warning', message, buttons: ['OK'] });
}

/** Opens the library. On failure the app still runs and the UI keeps settings for this run only. */
export async function openBackend(): Promise<OpenedBackend> {
  const fallback = path.join(app.getPath('documents'), 'Meeting Scribe');
  try {
    const root = await readLibraryLocation(app.getPath('userData'), fallback);
    const library = await Library.open({ root });
    if (library.replacedCorruptIndex !== null) {
      warn('The app index was damaged and has been replaced. Settings are back to their defaults.');
    }
    const settings = createSettingsHandlers(library.settings, root);
    return {
      handlers: {
        getSettings: async () => settings.getSettings(),
        updateSettings: async (request) => settings.updateSettings(request as SettingsPatch),
      },
      close: () => library.close(),
    };
  } catch {
    warn('The library could not be opened, so settings changes will not be saved.');
    return NOTHING_OPEN;
  }
}
