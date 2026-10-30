import { useCallback, useSyncExternalStore } from 'react';
import type {
  Backend,
  ImportFailureReason,
  ImportId,
  ImportStage,
  MeetingId,
  PickedAudioFile,
} from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';

export type ImportEntry = {
  importId: ImportId;
  fileName: string;
  /** Null for an import this UI did not start, such as one still running after a reload. */
  source: { file: PickedAudioFile; buildVoiceProfiles: boolean } | null;
} & (
  | { state: 'running'; stage: ImportStage; fraction: number; cancelling: boolean }
  | { state: 'finished'; meetingId: MeetingId }
  | { state: 'failed'; reason: ImportFailureReason; message: string }
);

type Patch = { fileName?: string } & (
  | { state: 'running'; stage: ImportStage; fraction: number }
  | { state: 'finished'; meetingId: MeetingId }
  | { state: 'failed'; reason: ImportFailureReason; message: string }
);

/**
 * Lives as long as the backend, not the screen: an import keeps running while the user is on
 * another screen, and the contract has no call that lists running imports.
 */
export class ImportTracker {
  private entries: ImportEntry[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly backend: Backend) {
    backend.on('importProgress', ({ importId, fileName, stage, fraction }) =>
      this.apply(importId, { fileName, state: 'running', stage, fraction }),
    );
    backend.on('importFinished', ({ importId, meetingId }) =>
      this.apply(importId, { state: 'finished', meetingId }),
    );
    backend.on('importFailed', ({ importId, fileName, reason, message }) =>
      this.apply(importId, { fileName, state: 'failed', reason, message }),
    );
    backend.on('importCancelled', ({ importId }) => this.dismiss(importId));
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getEntries = () => this.entries;

  async start(file: PickedAudioFile, buildVoiceProfiles: boolean): Promise<void> {
    const { importId } = await this.backend.call('importAudioFile', {
      fileToken: file.fileToken,
      buildVoiceProfiles,
    });
    // Events can arrive before this response, so the entry may already exist.
    const source = { file, buildVoiceProfiles };
    if (this.entries.some((entry) => entry.importId === importId)) {
      this.update(importId, (entry) => ({ ...entry, source }));
      return;
    }
    this.publish([
      ...this.entries,
      {
        importId,
        fileName: file.fileName,
        source,
        state: 'running',
        stage: 'queued',
        fraction: 0,
        cancelling: false,
      },
    ]);
  }

  async cancel(importId: ImportId): Promise<void> {
    this.update(importId, (entry) =>
      entry.state === 'running' ? { ...entry, cancelling: true } : entry,
    );
    try {
      await this.backend.call('cancelImport', { importId });
    } catch {
      this.update(importId, (entry) =>
        entry.state === 'running' ? { ...entry, cancelling: false } : entry,
      );
      throw new Error('The import could not be cancelled.');
    }
  }

  dismiss(importId: ImportId): void {
    this.publish(this.entries.filter((entry) => entry.importId !== importId));
  }

  private apply(importId: ImportId, patch: Patch): void {
    const existing = this.entries.find((entry) => entry.importId === importId);
    const base = {
      importId,
      fileName: patch.fileName ?? existing?.fileName ?? '',
      source: existing?.source ?? null,
    };
    const next: ImportEntry =
      patch.state === 'running'
        ? {
            ...base,
            state: 'running',
            stage: patch.stage,
            fraction: patch.fraction,
            cancelling: existing?.state === 'running' && existing.cancelling,
          }
        : patch.state === 'finished'
          ? { ...base, state: 'finished', meetingId: patch.meetingId }
          : { ...base, state: 'failed', reason: patch.reason, message: patch.message };
    this.publish(
      existing
        ? this.entries.map((entry) => (entry.importId === importId ? next : entry))
        : [...this.entries, next],
    );
  }

  private update(importId: ImportId, change: (entry: ImportEntry) => ImportEntry): void {
    this.publish(
      this.entries.map((entry) => (entry.importId === importId ? change(entry) : entry)),
    );
  }

  private publish(entries: ImportEntry[]): void {
    this.entries = entries;
    this.listeners.forEach((listener) => listener());
  }
}

const trackers = new WeakMap<Backend, ImportTracker>();

function trackerFor(backend: Backend): ImportTracker {
  let tracker = trackers.get(backend);
  if (!tracker) {
    tracker = new ImportTracker(backend);
    trackers.set(backend, tracker);
  }
  return tracker;
}

export function useImports() {
  const backend = useBackend();
  const tracker = trackerFor(backend);
  const entries = useSyncExternalStore(tracker.subscribe, tracker.getEntries);
  const start = useCallback(
    (file: PickedAudioFile, buildVoiceProfiles: boolean) => tracker.start(file, buildVoiceProfiles),
    [tracker],
  );
  return { entries, tracker, start };
}
